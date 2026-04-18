import { test } from '../../fixtures/test-fixtures';

test.describe('UAT: File security', () => {
  test.skip('authorized participant can download an attachment', async () => {
    // BLOCKED: file upload/download endpoints are not mapped in Program.cs.
  });

  test.skip('unauthorized user cannot download a direct attachment URL', async () => {
    // BLOCKED: no GET /api/files/{attachmentId} endpoint exists to return 403.
  });
});
