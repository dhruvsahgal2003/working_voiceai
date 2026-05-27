"""
Callora LiveKit Agent — sub-1s latency pipeline
  STT: Sarvam saarika (streaming WebSocket, high VAD sensitivity)
  VAD: Silero (audio-level voice activity detection)
  Turn detector: LiveKit MultilingualModel (semantic end-of-turn, Hindi+English aware)
  LLM: Groq Llama / OpenAI / Sarvam (token streaming, max 80 tokens)
  TTS: Sarvam bulbul:v3 (streaming WebSocket, min_buffer_size=30 for fast first audio)

Architecture: preemptive_generation=True so LLM starts generating while user is still speaking.
"""
import asyncio
import logging
import os
import time
import json
import re
import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("callora-agent")

try:
    from livekit import rtc
    from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli, RoomInputOptions
    from livekit.agents.voice.turn import TurnHandlingOptions, InterruptionOptions, EndpointingOptions
    from livekit.plugins import sarvam, openai as lk_openai, noise_cancellation, silero
    from livekit.plugins.turn_detector.multilingual import MultilingualModel
    LIVEKIT_AVAILABLE = True
except ImportError as e:
    logger.error(f"Missing plugin: {e}. Run: pip install livekit-plugins-silero livekit-plugins-turn-detector")
    LIVEKIT_AVAILABLE = False

# Optional Gemini Live (speech-to-speech) plugin
try:
    from livekit.plugins.google.realtime import RealtimeModel as GeminiRealtimeModel
    from google.genai import types as gemini_types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    GeminiRealtimeModel = None
    gemini_types = None

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "dev")

AMD_VOICEMAIL   = "machine-vm"

# ── Auto-hangup phrase detection ──────────────────────────────────────────────
# Fired after on_agent_turn_completed when agent delivers a closing line.
# Two-tier: WhatsApp close (strong signal, short delay) or explicit goodbye.
_WHATSAPP_CLOSE = re.compile(
    r'whatsapp\s*(pe|par|ko|mein)?\s*(details|info|link|share|kar\s*di|bhej)',
    re.IGNORECASE,
)
_GOODBYE_CLOSE = re.compile(
    r'\b(dhanyavaad|shukriya|alvida|goodbye|good\s*bye|take\s*care|'
    r'namaste\s*ji?|namaskar|have\s*a\s*good|have\s*a\s*nice|call\s*back\s*kar(?:te|na)\s*h[aiu])'
    r'\b',
    re.IGNORECASE,
)
AMD_IVR         = "machine-ivr"
AMD_UNAVAILABLE = "machine-unavailable"

# Hard sentence-length cap injected into every system prompt for speed
SPEED_RULES = (
    "\n\n# RESPONSE RULES (MANDATORY)\n"
    "- Reply in 1 short sentence. Maximum 15 words. Never 2 sentences.\n"
    "- No filler ('umm', 'so', 'okay so', 'I see'). Get to the point.\n"
    "- Ask ONE question at a time. Never stack questions.\n"
    "- Mirror the user's language (Hindi/English/Hinglish) but keep it crisp.\n"
    "- SCRIPT RULE: Write Hindi/Urdu words in Devanagari script (मैं, आप, क्या, etc.). "
    "English words, proper nouns and brand names stay in Roman (Real Concept, Golf Course Road, 2BHK, etc.). "
    "Example: 'मैं Riya बोल रही हूं Real Concept से — आपको property में interest है?'"
)


def substitute_vars(text: str, lead: dict) -> str:
    if not text:
        return text
    replacements = {
        "{{name}}": lead.get("name") or "there",
        "{{city}}": lead.get("city") or "Gurgaon",
        "{{budget}}": lead.get("budget") or "",
        "{{phone}}": lead.get("phone") or "",
        "{{property_type}}": lead.get("property_type") or "",
    }
    for key, val in replacements.items():
        text = text.replace(key, val)
    return text


async def fetch_agent_config(room_name: str) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/agent-config",
                params={"room": room_name},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
                timeout=5.0,
            )
            if resp.status_code == 200:
                config = resp.json()
                lead = config.pop("lead_metadata", {})
                config["system_prompt"] = substitute_vars(config.get("system_prompt", ""), lead) + SPEED_RULES
                config["first_message"] = substitute_vars(config.get("first_message", ""), lead)
                config["voicemail_message"] = substitute_vars(config.get("voicemail_message", ""), lead)
                if lead.get("language") and not config.get("language"):
                    config["language"] = lead["language"]
                return config
        except Exception as e:
            logger.error(f"Failed to fetch agent config: {e}")
    return get_default_config()


def get_default_config() -> dict:
    return {
        "system_prompt": (
            "You are Riya, a senior property consultant at Real Concept, Gurgaon. "
            "You are calling {{name}} about premium properties on Golf Course Road and Dwarka Expressway. "
            "Start with: 'यह call quality के लिए record हो सकती है।' "
            "Goal: qualify intent, BHK, budget, location, timeline — then book a site visit. "
            "Be warm, confident, Hinglish. If interested, say: 'Site visit arrange कर दूं?'"
        ) + SPEED_RULES,
        "first_message": "नमस्ते {{name}} जी! मैं Riya बोल रही हूं Real Concept से — Gurgaon properties में specialist। क्या आप अभी बात कर सकते हैं?",
        "voicemail_message": "नमस्ते {{name}} जी, मैं Riya हूं Real Concept Gurgaon से। Please call back करें। Thank you!",
        "language": "hi-IN",
        "stt_model": "saarika:v2.5",
        "tts_model": "bulbul:v3",
        "tts_speaker": "meera",
        "llm_model": "llama-3.1-8b-instant",
        "llm_provider": "groq",
        "llm_temperature": 0.6,
        "max_duration_minutes": 5,
        "voicemail_detection": True,
        "analysis_schema": {
            "interested": "boolean",
            "outcome": "interested|not_interested|callback|no_answer|wrong_number|voicemail",
            "intent": "buy|sell|rent",
            "budget_range": "string",
            "bhk_preference": "string",
            "location_preference": "string",
            "timeline": "string",
            "callback_time": "string",
        },
    }


async def send_call_result(room_name: str, result: dict):
    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                f"{BACKEND_URL}/api/webhook/agent",
                json=result,
                headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET},
                timeout=10.0,
            )
            logger.info(f"Call result sent for room: {room_name}")
        except Exception as e:
            logger.error(f"Failed to send call result: {e}")


async def analyze_transcript(transcript: list, schema: dict) -> dict:
    """Analyze transcript using direct Groq API call (avoids livekit LLM interface complexity)."""
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key or not transcript:
        return {}
    full_text = "\n".join([f"{t['role'].upper()}: {t['text']}" for t in transcript])
    prompt = (
        f"Analyze this real estate sales call transcript and extract fields as JSON:\n"
        f"{json.dumps(schema, indent=2)}\n\n"
        f"Transcript:\n{full_text}\n\n"
        f"Return ONLY valid JSON. Use null for unknown fields. No explanation."
    )
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 300,
                    "temperature": 0.3,
                },
                timeout=15.0,
            )
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group())
    except Exception as e:
        logger.error(f"Analysis error: {e}")
    return {}


class CalloraAgent(Agent):
    def __init__(self, config: dict, session_ref: list):
        super().__init__(instructions=config["system_prompt"])
        self.config = config
        self.transcript = []
        self.start_time = None
        self.first_response_at = None   # time of first agent utterance (latency measurement)
        self.is_voicemail = False
        self.amd_result = None
        self._session_ref = session_ref
        self._hangup_scheduled = False   # prevent double-close from keyword detection

    async def on_enter(self):
        self.start_time = time.time()
        if self.is_voicemail:
            return
        if is_gemini_realtime(self.config.get("llm_model", "")):
            # Gemini Live: trigger greeting via generate_reply so Gemini speaks first.
            # Can't use session.say() (no TTS model). Can't use proactivity=True
            # (crashes silently when SIP participant hasn't joined yet).
            first_msg = self.config.get("first_message", "")
            if first_msg and self._session_ref:
                prompt = f"[Call just connected. Say this EXACTLY as your opening line, then continue naturally]: {first_msg}"
                await self._session_ref[0].generate_reply(user_input=prompt)
            return
        # Sarvam pipeline: session.say() works fine (has TTS model)
        first_msg = self.config.get("first_message")
        if first_msg and self._session_ref:
            # Record greeting immediately — session.say() bypasses the LLM pipeline so
            # on_agent_turn_completed is NOT called for it.  Without this, short calls
            # where the lead hangs up before responding produce an empty transcript.
            self.transcript.append({"role": "agent", "text": first_msg, "timestamp": 0})
            if self.first_response_at is None:
                self.first_response_at = 0   # greeting is t=0
            await self._session_ref[0].say(first_msg, allow_interruptions=True)

    async def on_user_turn_completed(self, turn_ctx, new_message):
        text = new_message.text_content
        if not text:
            return
        self.transcript.append({
            "role": "user",
            "text": text,
            "timestamp": int((time.time() - (self.start_time or time.time())) * 1000),
        })

    async def on_agent_turn_completed(self, turn_ctx, new_message):
        text = new_message.text_content
        if not text:
            return
        now = time.time()
        ts_ms = int((now - (self.start_time or now)) * 1000)
        # Deduplicate: session.say() (greeting) is already recorded in on_enter,
        # so don't double-add it if the LLM somehow also fires for it.
        last = self.transcript[-1] if self.transcript else {}
        if last.get("role") == "agent" and last.get("text") == text:
            return
        # Track first LLM-generated utterance time (post-greeting latency)
        if self.first_response_at == 0 or self.first_response_at is None:
            self.first_response_at = ts_ms
        self.transcript.append({
            "role": "agent",
            "text": text,
            "timestamp": ts_ms,
        })

        # ── Auto-hangup: schedule close when agent delivers a closing phrase ──
        # Only look after the first turn (greeting is turn 0, shouldn't trigger).
        if not self._hangup_scheduled and len(self.transcript) > 1:
            if _WHATSAPP_CLOSE.search(text):
                self._hangup_scheduled = True
                logger.info("[auto_hangup] WhatsApp close detected — hanging up in 4s")
                asyncio.ensure_future(self._auto_hangup(delay=4.0))
            elif _GOODBYE_CLOSE.search(text):
                self._hangup_scheduled = True
                logger.info("[auto_hangup] Goodbye phrase detected — hanging up in 2.5s")
                asyncio.ensure_future(self._auto_hangup(delay=2.5))

    async def _auto_hangup(self, delay: float = 3.0):
        """Wait for TTS to finish speaking, then close the session."""
        await asyncio.sleep(delay)
        if self._session_ref:
            try:
                await self._session_ref[0].aclose()
            except Exception as e:
                logger.warning(f"[auto_hangup] aclose error: {e}")

    # Note: end_call is intentionally NOT a @function_tool.
    # Small LLMs (8B) read tool instructions as literal text and say "end_call" out loud.
    # Hangup is handled deterministically by _auto_hangup via keyword detection instead.
    async def end_call(self):
        """Internal alias kept for compatibility."""
        await self._auto_hangup(delay=0)


def is_gemini_realtime(llm_model: str) -> bool:
    """Gemini Live API models are speech-to-speech — they replace STT+LLM+TTS entirely."""
    if not llm_model:
        return False
    m = llm_model.lower()
    return m.startswith("gemini-live") or ("native-audio" in m) or m.startswith("gemini-2.5-flash-native")


def build_gemini_realtime(config: dict):
    """Build a Gemini Live RealtimeModel (single speech-to-speech model, no STT/TTS needed).

    NOTE: Gemini has two model families:
      - VertexAI:    'gemini-live-2.5-flash-native-audio'  (needs GCP project)
      - Gemini API:  'gemini-2.5-flash-native-audio-preview-12-2025'  (works with AI Studio key)
    We auto-translate VertexAI names → Gemini API names if no GCP project is configured.

    proactivity=True  → Gemini speaks first as soon as the call connects (replaces session.say()).
    first_message is embedded in instructions so Gemini knows exactly what to say.
    """
    if not GEMINI_AVAILABLE:
        raise RuntimeError("Gemini Live plugin not installed: pip install livekit-plugins-google")
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    use_vertex = bool(os.getenv("GOOGLE_CLOUD_PROJECT"))
    if not api_key and not use_vertex:
        raise RuntimeError("GEMINI_API_KEY required. Get one free at https://aistudio.google.com/apikey")

    model_name = config.get("llm_model") or "gemini-2.5-flash-native-audio-preview-12-2025"
    # Auto-translate old VertexAI model name → Gemini API name when using AI Studio key
    if not use_vertex and model_name.startswith("gemini-live-"):
        model_name = "gemini-2.5-flash-native-audio-preview-12-2025"

    voice = config.get("realtime_voice") or "Aoede"
    language = config.get("language", "en-IN")

    instructions = config.get("system_prompt", "")

    logger.info(f"LLM: Gemini Live {model_name}, voice={voice}, vertex={use_vertex}")

    # Gemini automatic VAD tuned for phone calls.
    # HIGH end-of-speech sensitivity + 500ms silence window.
    # (Manual VAD via Silero doesn't work — Silero sends commit_audio which
    # Gemini doesn't support. Gemini needs activity_end signals instead.)
    vad_config = gemini_types.RealtimeInputConfig(
        automatic_activity_detection=gemini_types.AutomaticActivityDetection(
            start_of_speech_sensitivity=gemini_types.StartSensitivity.START_SENSITIVITY_HIGH,
            end_of_speech_sensitivity=gemini_types.EndSensitivity.END_SENSITIVITY_HIGH,
            prefix_padding_ms=20,
            silence_duration_ms=500,
        )
    )

    kwargs = dict(
        model=model_name,
        voice=voice,
        language=language,
        instructions=instructions,
        temperature=config.get("llm_temperature", 0.7),
        modalities=["AUDIO"],
        realtime_input_config=vad_config,
        # NOTE: proactivity=True causes silent session crash when SIP participant
        # hasn't joined yet. Greeting is triggered via generate_reply() in on_enter instead.
    )
    if use_vertex:
        kwargs["vertexai"] = True
        kwargs["project"] = os.getenv("GOOGLE_CLOUD_PROJECT")
        kwargs["location"] = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    else:
        kwargs["api_key"] = api_key
    return GeminiRealtimeModel(**kwargs)


def build_llm(config: dict):
    """Route LLM by MODEL NAME (provider field is unreliable). Force short responses for speed."""
    llm_model = config.get("llm_model") or "llama-3.3-70b-versatile"
    temperature = config.get("llm_temperature", 0.6)

    # Model name is the source of truth — provider field in DB is often missing/stale
    if llm_model.startswith("sarvam"):
        logger.info(f"LLM: Sarvam {llm_model}")
        return sarvam.LLM(
            model=llm_model,
            api_key=os.getenv("SARVAM_API_KEY"),
            temperature=temperature,
        )
    if llm_model.startswith(("llama", "mixtral", "gemma", "deepseek", "qwen")):
        # 8B models: cap at 60 tokens (15-word replies). 70B+: 80 tokens.
        is_small = "8b" in llm_model.lower()
        max_tokens = 60 if is_small else 80
        logger.info(f"LLM: Groq {llm_model} (max_tokens={max_tokens})")
        return lk_openai.LLM(
            model=llm_model,
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1",
            temperature=temperature,
            max_completion_tokens=max_tokens,
        )
    logger.info(f"LLM: OpenAI {llm_model}")
    return lk_openai.LLM(
        model=llm_model,
        api_key=os.getenv("OPENAI_API_KEY"),
        temperature=temperature,
        max_completion_tokens=80,
    )


def prewarm(proc):
    """Pre-load Silero VAD and turn detector model in worker process — avoids cold-start on first call."""
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.03,        # detect speech onset almost instantly (~30ms)
        min_silence_duration=0.20,       # 200ms silence = end of speech (faster turn handoff)
        prefix_padding_duration=0.10,
        activation_threshold=0.35,       # more sensitive — catches quiet "haan/nahi" interruptions
    )
    logger.info("Prewarm complete: Silero VAD loaded")


async def entrypoint(ctx: JobContext):
    logger.info(f"Agent joining room: {ctx.room.name}")
    config = await fetch_agent_config(ctx.room.name)
    await ctx.connect()

    session_ref = []
    agent = CalloraAgent(config=config, session_ref=session_ref)
    llm_model = config.get("llm_model") or ""

    # ── BRANCH 1: Gemini Live (speech-to-speech, single model, lowest latency) ──
    if is_gemini_realtime(llm_model):
        realtime_model = build_gemini_realtime(config)
        # Pass Silero VAD so it drives Gemini's activity signals (manual mode).
        # Gemini's built-in VAD is disabled in realtime_input_config because it
        # can't handle 8kHz PSTN audio — falls back to ~8-10s fixed timeout.
        # Silero gives ~350ms silence detection and works well with narrowband audio.
        # No VAD passed — Gemini handles turn detection via its own automatic VAD.
        # Silero is incompatible (sends commit_audio, Gemini needs activity_end).
        session = AgentSession(llm=realtime_model)
        session_ref.append(session)
        # Gemini handles voicemail/AMD passively — leave a message if detected
        if config.get("voicemail_detection", True):
            @ctx.room.on("participant_attributes_changed")
            def on_attributes_changed(changed_attributes: dict, participant: rtc.Participant):
                amd_attr = changed_attributes.get("sip.amd.result") or (
                    participant.attributes or {}
                ).get("sip.amd.result")
                if amd_attr and amd_attr in (AMD_VOICEMAIL, AMD_IVR, AMD_UNAVAILABLE):
                    agent.is_voicemail = True
                    agent.amd_result = amd_attr
                    vm_msg = config.get("voicemail_message", "Please call us back. Thank you!")
                    async def _leave_voicemail():
                        await session.say(vm_msg)
                        await asyncio.sleep(1)
                        await session.aclose()
                    asyncio.ensure_future(_leave_voicemail())

        max_secs = config.get("max_duration_minutes", 5) * 60
        try:
            await session.start(
                agent,
                room=ctx.room,
                # BVCTelephony = noise cancellation tuned for 8kHz PSTN/SIP audio
                room_input_options=RoomInputOptions(noise_cancellation=noise_cancellation.BVCTelephony()),
            )
            await asyncio.wait_for(session.wait_for_inactive(), timeout=max_secs)
        except asyncio.TimeoutError:
            logger.info(f"Max duration reached for room: {ctx.room.name}")
            await session.aclose()
        except Exception as e:
            logger.error(f"Gemini session error: {e}", exc_info=True)
        finally:
            duration = int(time.time() - (agent.start_time or time.time()))
            if duration < 3 and not agent.transcript:
                logger.warning(f"Session ended in <3s with no transcript — skipping call result for {ctx.room.name}")
                return
            full_text = "\n".join([f"{t['role'].upper()}: {t['text']}" for t in agent.transcript])

            # Post-call analysis via direct Groq API
            analysis = await analyze_transcript(agent.transcript, config.get("analysis_schema", {}))
            if agent.is_voicemail:
                analysis["outcome"] = "voicemail"
            elif not analysis.get("outcome"):
                analysis["outcome"] = "completed"

            await send_call_result(ctx.room.name, {
                "room_name": ctx.room.name,
                "duration_seconds": duration,
                "transcript": agent.transcript,
                "full_text": full_text,
                "analysis": {**analysis, "first_response_ms": agent.first_response_at},
                "amd_result": agent.amd_result,
                "is_voicemail": agent.is_voicemail,
            })
        return

    # ── BRANCH 2: Classic Sarvam STT + LLM + TTS pipeline ──
    llm = build_llm(config)

    _stt_model = config.get("stt_model") or "saarika:v2.5"
    # Use "unknown" language for saarika:v2.5 = per-utterance auto-detect (Hindi/English/Hinglish)
    # Only lock to a specific language if user explicitly set one AND it's hi-IN (pure Hindi mode)
    _configured_lang = config.get("language") or ""
    if _stt_model == "saarika:v2.5":
        # Auto-detect unless user pinned to pure Hindi ("hi-IN")
        _stt_lang = _configured_lang if _configured_lang == "hi-IN" else "unknown"
    else:
        _stt_lang = _configured_lang or "en-IN"
    logger.info(f"STT: {_stt_model} language={_stt_lang}")
    stt = sarvam.STT(
        model=_stt_model,
        language=_stt_lang,
        api_key=os.getenv("SARVAM_API_KEY"),
        high_vad_sensitivity=True,
        positive_speech_threshold=0.5,
        negative_speech_threshold=0.25,
        min_speech_frames=2,
        pre_speech_pad_frames=2,
        interrupt_min_speech_frames=2,
    )
    _tts_model   = config.get("tts_model") or "bulbul:v3"
    # TTS language: use configured or default hi-IN (handles Hinglish well with Indian accent)
    _tts_lang    = _configured_lang or "hi-IN"
    _tts_speaker = config.get("tts_speaker") or "meera"
    _tts_pace    = float(config.get("tts_pace") or 1.4)   # 1.4 = fast but clear
    _tts_temp    = min(float(config.get("tts_temperature") or 0.9), 1.0)  # Sarvam API rejects >1.0
    logger.info(f"TTS: {_tts_model} lang={_tts_lang} pace={_tts_pace}")
    tts = sarvam.TTS(
        model=_tts_model,
        target_language_code=_tts_lang,
        speaker=_tts_speaker,
        api_key=os.getenv("SARVAM_API_KEY"),
        min_buffer_size=60,       # 30→60: prevents micro-stutters from 30-char burst firing
        max_chunk_length=180,     # 50→180: full sentences per chunk = no broken syllables mid-word
        speech_sample_rate=24000, # 22050→24000: crisper audio generation quality
        pace=_tts_pace,
        temperature=_tts_temp,
    )
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=ctx.proc.userdata["vad"],
        turn_detection=MultilingualModel(),
        preemptive_generation=True,
        turn_handling=TurnHandlingOptions(
            interruption=InterruptionOptions(
                enabled=True,
                mode="vad",
                min_duration=0.1,        # 100ms — catch quick "haan/nahi/ruko" interruptions
                min_words=1,             # single word interrupt
            ),
            endpointing=EndpointingOptions(
                mode="dynamic",
                min_delay=0.10,          # slightly faster endpointing
                max_delay=1.2,           # tighter max — don't wait too long for turn end
            ),
        ),
    )
    session_ref.append(session)

    # Voicemail detection
    if config.get("voicemail_detection", True):
        @ctx.room.on("participant_attributes_changed")
        def on_attributes_changed(changed_attributes: dict, participant: rtc.Participant):
            amd_attr = changed_attributes.get("sip.amd.result") or (
                participant.attributes or {}
            ).get("sip.amd.result")
            if amd_attr and amd_attr in (AMD_VOICEMAIL, AMD_IVR, AMD_UNAVAILABLE):
                agent.is_voicemail = True
                agent.amd_result = amd_attr
                vm_msg = config.get("voicemail_message", "Hi, please call us back. Thank you!")
                async def _leave_voicemail():
                    await session.say(vm_msg, allow_interruptions=False)
                    await asyncio.sleep(1)
                    await session.aclose()
                asyncio.ensure_future(_leave_voicemail())

    max_secs = config.get("max_duration_minutes", 5) * 60

    session_crashed = False
    try:
        await session.start(
            agent,
            room=ctx.room,
            # BVCTelephony = noise cancellation tuned for 8kHz PSTN/SIP audio
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVCTelephony(),
            ),
        )
        await asyncio.wait_for(session.wait_for_inactive(), timeout=max_secs)
    except asyncio.TimeoutError:
        logger.info(f"Max duration reached for room: {ctx.room.name}")
        await session.aclose()
    except Exception as e:
        logger.error(f"Sarvam session error: {e}", exc_info=True)
        session_crashed = True
    finally:
        duration = int(time.time() - (agent.start_time or time.time()))

        # Guard: session crashed or ended in <3s with no real conversation
        # → reset lead to retry, skip webhook (avoids spurious call.completed events)
        if session_crashed or (duration < 3 and not agent.transcript):
            logger.warning(
                f"Session ended abnormally for {ctx.room.name} "
                f"(crashed={session_crashed}, duration={duration}s, "
                f"transcript_turns={len(agent.transcript)}) — resetting lead to retry"
            )
            # Reset lead status so the campaign retries it
            lead_id_match = __import__('re').match(r'^call-([a-f0-9-]{36})-', ctx.room.name)
            if lead_id_match:
                try:
                    import httpx as _httpx
                    async with _httpx.AsyncClient() as _c:
                        await _c.post(
                            f"{BACKEND_URL}/api/webhook/agent-reset",
                            json={"room_name": ctx.room.name, "lead_id": lead_id_match.group(1)},
                            headers={"X-Internal-Secret": INTERNAL_SECRET},
                            timeout=5.0,
                        )
                except Exception as reset_err:
                    logger.warning(f"Could not reset lead: {reset_err}")
            return

        full_text = "\n".join([f"{t['role'].upper()}: {t['text']}" for t in agent.transcript])

        analysis = await analyze_transcript(agent.transcript, config.get("analysis_schema", {}))
        if agent.is_voicemail:
            analysis["outcome"] = "voicemail"
        elif not analysis.get("outcome"):
            analysis["outcome"] = "completed"

        await send_call_result(ctx.room.name, {
            "room_name": ctx.room.name,
            "duration_seconds": duration,
            "transcript": agent.transcript,
            "full_text": full_text,
            "analysis": {**analysis, "first_response_ms": agent.first_response_at},
            "amd_result": agent.amd_result,
            "is_voicemail": agent.is_voicemail,
        })


if __name__ == "__main__":
    if not LIVEKIT_AVAILABLE:
        print("ERROR: Install dependencies: pip install -r requirements.txt")
        exit(1)
    logging.basicConfig(level=logging.INFO)
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="propconnect",
    ))
