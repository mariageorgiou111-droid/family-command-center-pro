import { invariant } from './records.mjs';

// User content is always literal text. No arbitrary attributes, HTML, URLs or
// inline handlers are accepted. Calling code supplies the trusted DOM document.
export function recordElement(document, { id, title, notes = '', onEdit }) {
  invariant(typeof id === 'string' && id.trim().length > 0, 'MISSING_ID', 'A stable ID is required for rendering.');
  invariant(typeof onEdit === 'function', 'INVALID_HANDLER', 'A trusted edit callback is required.');
  const article = document.createElement('article');
  article.dataset.recordId = id;
  const heading = document.createElement('strong'); heading.textContent = String(title ?? '');
  const detail = document.createElement('p'); detail.textContent = String(notes ?? '');
  const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
  edit.addEventListener('click', () => onEdit(id));
  article.append(heading, detail, edit);
  return article;
}
