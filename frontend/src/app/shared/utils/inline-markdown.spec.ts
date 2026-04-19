import { describe, it, expect } from 'vitest';
import { parseInlineMarkdown, serializeToMarkdown, markersToHtml } from './inline-markdown';

describe('parseInlineMarkdown', () => {
  it('converts **text** to <strong>', () => {
    expect(parseInlineMarkdown('hello **world**')).toBe('hello <strong>world</strong>');
  });

  it('converts _text_ to <em>', () => {
    expect(parseInlineMarkdown('hello _world_')).toBe('hello <em>world</em>');
  });

  it('converts `text` to <code>', () => {
    expect(parseInlineMarkdown('run `npm install`')).toBe('run <code>npm install</code>');
  });

  it('escapes HTML before rendering to prevent XSS', () => {
    expect(parseInlineMarkdown('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('handles plain text unchanged', () => {
    expect(parseInlineMarkdown('hello world')).toBe('hello world');
  });

  it('handles mixed formatting', () => {
    expect(parseInlineMarkdown('**bold** and _italic_ and `code`')).toBe(
      '<strong>bold</strong> and <em>italic</em> and <code>code</code>'
    );
  });
});

describe('serializeToMarkdown', () => {
  it('converts <strong> to **markers**', () => {
    expect(serializeToMarkdown('<strong>bold</strong>')).toBe('**bold**');
  });

  it('converts <b> to **markers**', () => {
    expect(serializeToMarkdown('<b>bold</b>')).toBe('**bold**');
  });

  it('converts <em> to _markers_', () => {
    expect(serializeToMarkdown('<em>italic</em>')).toBe('_italic_');
  });

  it('converts <i> to _markers_', () => {
    expect(serializeToMarkdown('<i>italic</i>')).toBe('_italic_');
  });

  it('converts <code> to backtick markers', () => {
    expect(serializeToMarkdown('<code>npm install</code>')).toBe('`npm install`');
  });

  it('converts <div> to newline', () => {
    expect(serializeToMarkdown('line1<div>line2</div>')).toBe('line1\nline2');
  });

  it('strips unknown tags', () => {
    expect(serializeToMarkdown('<span>text</span>')).toBe('text');
  });

  it('decodes HTML entities', () => {
    expect(serializeToMarkdown('&amp;lt;&gt;')).toBe('&lt;>');
  });
});

describe('markersToHtml', () => {
  it('converts **markers** to <strong>', () => {
    expect(markersToHtml('**bold**')).toBe('<strong>bold</strong>');
  });

  it('converts _markers_ to <em>', () => {
    expect(markersToHtml('_italic_')).toBe('<em>italic</em>');
  });

  it('converts backtick markers to <code>', () => {
    expect(markersToHtml('`code`')).toBe('<code>code</code>');
  });

  it('converts newlines to <br>', () => {
    expect(markersToHtml('line1\nline2')).toBe('line1<br>line2');
  });
});
