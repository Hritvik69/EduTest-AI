import { describe, expect, it } from "vitest";
import {
  parseServerEventBlock,
  pdfUploadInterruptedStreamMessage,
  readUploadApiPayload,
} from "@/components/wizard/pdf-upload-step";

describe("PDF upload client stream parser", () => {
  it("parses normal LF server-sent events", async () => {
    const progress: Array<{ progress: number; message: string }> = [];
    const payload = await readUploadApiPayload(
      streamResponse(
        [
          `event: progress\ndata: {"progress":24,"message":"Reading PDF"}\n\n`,
          `event: complete\ndata: {"success":true,"data":{"source":{"id":1}}}\n\n`,
        ].join(""),
      ),
      new AbortController().signal,
      (event) => progress.push(event),
    );

    expect(progress).toEqual([{ progress: 24, message: "Reading PDF" }]);
    expect(payload).toEqual({
      success: true,
      data: { source: { id: 1 } },
    });
  });

  it("parses CRLF server-sent events", () => {
    expect(
      parseServerEventBlock(
        'event: progress\r\ndata: {"progress":44,"message":"OCR page"}',
      ),
    ).toEqual({
      event: "progress",
      data: { progress: 44, message: "OCR page" },
    });
  });

  it("handles a final buffered complete event without a trailing separator", async () => {
    const payload = await readUploadApiPayload(
      streamResponse('event: complete\ndata: {"success":true,"data":{"source":{"id":2}}}'),
      new AbortController().signal,
      () => {},
    );

    expect(payload).toEqual({
      success: true,
      data: { source: { id: 2 } },
    });
  });

  it("handles a final buffered error event without a trailing separator", async () => {
    await expect(
      readUploadApiPayload(
        streamResponse('event: error\ndata: {"success":false,"error":"Timed out","code":504}'),
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow("Timed out");
  });

  it("returns a friendly interrupted-stream message for silent EOF", async () => {
    const payload = await readUploadApiPayload(
      streamResponse('event: progress\ndata: {"progress":50,"message":"Working"}\n\n'),
      new AbortController().signal,
      () => {},
    );

    expect(payload).toEqual({
      success: false,
      error: pdfUploadInterruptedStreamMessage,
      code: 0,
    });
  });
});

function streamResponse(body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}
