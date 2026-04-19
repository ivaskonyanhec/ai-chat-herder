import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FilesApiService } from './files-api.service';
import type { AttachmentDto } from './files.models';

describe('FilesApiService', () => {
  let service: FilesApiService;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FilesApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FilesApiService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('uploadFile posts FormData to /api/files/upload and returns AttachmentDto', () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    const expected: AttachmentDto = {
      id: 'aaa', fileName: 'test.txt', contentType: 'text/plain', sizeBytes: 5, comment: null,
    };
    let actual: AttachmentDto | undefined;

    service.uploadFile(file).subscribe(dto => (actual = dto));

    const req = controller.expectOne('/api/files/upload');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    req.flush(expected, { status: 201, statusText: 'Created' });
    expect(actual).toEqual(expected);
  });

  it('uploadFile includes optional comment in FormData', () => {
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });

    service.uploadFile(file, 'Q4 Report').subscribe();

    const req = controller.expectOne('/api/files/upload');
    const fd = req.request.body as FormData;
    expect(fd.get('comment')).toBe('Q4 Report');
    req.flush({}, { status: 201, statusText: 'Created' });
  });

  it('getFileUrl returns the correct API path', () => {
    expect(service.getFileUrl('abc-123')).toBe('/api/files/abc-123');
  });
});
