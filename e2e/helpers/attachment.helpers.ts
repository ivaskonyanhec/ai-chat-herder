import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function createTempFile(name: string, sizeBytes: number, fill = 0xab): string {
  const filePath = path.join(os.tmpdir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`);
  fs.writeFileSync(filePath, Buffer.alloc(sizeBytes, fill));
  return filePath;
}

export function removeTempFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
