import type { RawWaMessage } from '../normalize.js';

/**
 * Shapes captured from a real `messages.upsert` stream and stripped of identifying detail. The farmer
 * number is the same anonymised one used across the media fixtures. Timestamps are fixed so a fixture can
 * never make a test pass by depending on the day it ran.
 */

export const SELF_JID = '2348012345678@s.whatsapp.net';
export const FARMER_JID = '2348082974602@s.whatsapp.net';
export const GROUP_JID = '120363000000000000@g.us';
export const LID_JID = '11051234567890@lid';
export const FARMER_E164 = '+2348082974602';
export const SELF_E164 = '+2348012345678';

export const textMessage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60718', remoteJid: FARMER_JID, fromMe: false },
  message: { conversation: 'Good morning, my birds are not eating' },
  messageTimestamp: 1789012345,
};

export const pidginVoiceNote: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60719', remoteJid: FARMER_JID, fromMe: false },
  message: {
    audioMessage: {
      mimetype: 'audio/ogg; codecs=opus',
      fileLength: 48123,
      directPath: '/v/t62.7118-24/1234567890',
      mediaKey: 'k2ZQ2Xk0mQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ=',
    },
  },
  messageTimestamp: 1789012800,
};

export const voiceNoteWithGenericMime: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F6071A', remoteJid: FARMER_JID, fromMe: false },
  message: {
    audioMessage: {
      mimetype: 'application/octet-stream',
      fileLength: 48123,
      directPath: '/v/t62.7118-25/1234567891',
      mediaKey: 'k2ZQ2Xk0mQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ=',
    },
  },
  messageTimestamp: 1789012860,
};

export const voiceNoteMislabelledAsImage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F6071B', remoteJid: FARMER_JID, fromMe: false },
  message: {
    audioMessage: {
      mimetype: 'image/jpeg',
      fileLength: 48123,
      directPath: '/v/t62.7118-26/1234567892',
      mediaKey: 'k2ZQ2Xk0mQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ=',
    },
  },
  messageTimestamp: 1789012920,
};

export const captionedPhoto: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F6071C', remoteJid: FARMER_JID, fromMe: false },
  message: {
    imageMessage: {
      mimetype: 'image/jpeg',
      fileLength: 204800,
      caption: 'This one was shaking this morning',
      directPath: '/v/t62.7118-27/1234567893',
      mediaKey: 'k2ZQ2Xk0mQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ=',
    },
  },
  messageTimestamp: 1789013000,
};

export const documentMessage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F6071D', remoteJid: FARMER_JID, fromMe: false },
  message: {
    documentMessage: {
      mimetype: 'application/pdf',
      fileName: 'vet-note.pdf',
      fileLength: 51200,
      directPath: '/v/t62.7118-28/1234567894',
      mediaKey: 'k2ZQ2Xk0mQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ=',
    },
  },
  messageTimestamp: 1789013060,
};

export const videoMessage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F6071E', remoteJid: FARMER_JID, fromMe: false },
  message: {
    videoMessage: {
      mimetype: 'video/mp4',
      fileLength: 900000,
      directPath: '/v/t62.7118-29/1234567895',
      mediaKey: 'k2ZQ2Xk0mQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ1sQ=',
    },
  },
  messageTimestamp: 1789013120,
};

export const extendedTextReply: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F6071F', remoteJid: FARMER_JID, fromMe: false },
  message: { extendedTextMessage: { text: 'The one you asked about died overnight' } },
  messageTimestamp: 1789013180,
};

export const longFormTimestamp: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60720', remoteJid: FARMER_JID, fromMe: false },
  message: { conversation: 'dey no dey chop' },
  messageTimestamp: { low: 1789013240 },
};

export const ownOutboundMessage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60721', remoteJid: FARMER_JID, fromMe: true },
  message: { conversation: 'How can I help?' },
  messageTimestamp: 1789013300,
};

export const groupMessage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60722', remoteJid: GROUP_JID, fromMe: false, participant: FARMER_JID },
  message: { conversation: 'my birds are dying' },
  messageTimestamp: 1789013360,
};

export const lidMessage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60723', remoteJid: LID_JID, fromMe: false },
  message: { conversation: 'my birds are dying' },
  messageTimestamp: 1789013420,
};

export const statusBroadcast: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60724', remoteJid: 'status@broadcast', fromMe: false },
  message: { conversation: '' },
  messageTimestamp: 1789013480,
};

export const revokedMessage: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60725', remoteJid: FARMER_JID, fromMe: false },
  messageTimestamp: 1789013540,
};

export const messageWithoutId: RawWaMessage = {
  key: { remoteJid: FARMER_JID, fromMe: false },
  message: { conversation: 'my birds are dying' },
  messageTimestamp: 1789013600,
};

export const whitespaceOnlyText: RawWaMessage = {
  key: { id: '3EB0A1B2C3D4E5F60726', remoteJid: FARMER_JID, fromMe: false },
  message: { conversation: '   ' },
  messageTimestamp: 1789013660,
};
