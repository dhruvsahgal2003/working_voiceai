// StatusBadge — color-coded badge for lead/call/campaign statuses
export default function StatusBadge({ status }) {
  const map = {
    hot_lead: ['badge-green', '🔥 Hot Lead'],
    interested: ['badge-green', '✓ Interested'],
    callback: ['badge-blue', '📅 Callback'],
    not_interested: ['badge-gray', 'Not Interested'],
    pending: ['badge-amber', '⏳ Pending'],
    calling: ['badge-blue', '📞 Calling'],
    called: ['badge-teal', 'Called'],
    retry: ['badge-amber', '↻ Retry'],
    dnc: ['badge-red', '🚫 DNC'],
    invalid: ['badge-red', 'Invalid'],
    voicemail: ['badge-gray', 'Voicemail'],
    no_answer: ['badge-gray', 'No Answer'],
    busy: ['badge-gray', 'Busy'],
    failed: ['badge-red', 'Failed'],
    completed: ['badge-teal', '✓ Completed'],
    wrong_number: ['badge-red', 'Wrong #'],
    // campaign statuses
    draft: ['badge-gray', 'Draft'],
    running: ['badge-green', '▶ Running'],
    paused: ['badge-amber', '⏸ Paused'],
    completed_camp: ['badge-teal', '✓ Done'],
    // outcomes
    dnc_requested: ['badge-red', 'DNC Req.'],
    unknown: ['badge-gray', 'Unknown'],
  };
  const [cls, label] = map[status] || ['badge-gray', status || '—'];
  return <span className={`badge ${cls}`}>{label}</span>;
}
