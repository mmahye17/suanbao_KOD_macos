// DISABLED (Sprint 1): Chatbox remote file parsing removed.
// Was uploading files to chatboxai.app for cloud parsing.
// TODO: replace with Kod's own remote parsing service.

/**
 * Parse file remotely — DISABLED (Sprint 1)
 * Was sending files to Chatbox backend. Remote parsing will be replaced with Kod's own service.
 */
export async function parseFileRemotely(_filePath: string, _filename: string, _mimeType: string): Promise<string> {
  throw new Error('Remote file parsing is disabled. Chatbox backend has been removed. Use local parsing instead.')
}
