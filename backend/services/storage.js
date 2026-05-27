// Storage service — upload call recordings to Supabase S3-compatible storage
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.SUPABASE_S3_BUCKET || 'call-recordings';

let s3 = null;
function getS3() {
  if (s3) return s3;
  if (!process.env.SUPABASE_S3_ACCESS_KEY) return null;
  s3 = new S3Client({
    region: process.env.SUPABASE_S3_REGION || 'ap-south-1',
    endpoint: process.env.SUPABASE_S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
      secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
  return s3;
}

async function uploadRecording(callId, buffer, contentType = 'audio/mpeg') {
  const client = getS3();
  if (!client) return null;
  const key = `recordings/${callId}.mp3`;
  await client.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType,
  }));
  return key;
}

async function getRecordingUrl(key, expiresIn = 3600) {
  const client = getS3();
  if (!client || !key) return null;
  return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

module.exports = { uploadRecording, getRecordingUrl };
