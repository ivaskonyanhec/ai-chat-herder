import { test } from '../fixtures/test-fixtures';

test.describe('File attachments', () => {
  test.skip('user uploads an arbitrary file through the browser and a room member downloads it with 200', async () => {
    // BLOCKED: Program.cs does not map file upload/download endpoints and the room UI has no file-input/upload-submit contract.
  });

  test.skip('user uploads an image through the browser and a room member downloads it with 200', async () => {
    // BLOCKED: image upload endpoint and browser-visible attachment UI are not implemented.
  });

  test.skip('non-member cannot download a direct attachment URL and receives 403', async () => {
    // BLOCKED: no GET /api/files/{attachmentId} endpoint exists to enforce attachment download authorization.
  });

  test.skip('image uploads over 3 MB are rejected', async () => {
    // BLOCKED: no upload endpoint exists to validate image size.
  });

  test.skip('file uploads over 20 MB are rejected', async () => {
    // BLOCKED: no upload endpoint exists to validate file size.
  });

  test.skip('original filename and optional comment are preserved', async () => {
    // BLOCKED: Attachment entity supports metadata, but no upload UI/API path currently exposes it.
  });
});
