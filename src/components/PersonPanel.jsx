'use client'

import { useActionState, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertImage,
  Separator,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { updatePersonBio, uploadPersonPhoto, deletePersonPhoto } from '../db/actions'
import './PersonPanel.css'

const noopAction = async (state) => state
const initialUploadState = { error: null, photos: [] }
const DEFAULT_PANEL_WIDTH = 360
const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH_RATIO = 0.7

// Slide-in panel for a person's Markdown bio + photo gallery. See
// specs/person-details/spec.md. Always mounted (even when closed) so the
// slide transition can animate; `details` is only non-null while a
// person is selected. No backdrop/modal behavior — the tree behind it
// stays fully visible and interactive; the panel only closes via the ×
// button.
export default function PersonPanel({ personId, details, onClose }) {
  const isOpen = Boolean(personId)

  const [isEditingBio, setIsEditingBio] = useState(false)
  const editorRef = useRef(null)
  const [bioPending, setBioPending] = useState(false)
  const [bioError, setBioError] = useState(null)

  // Drag-to-resize from the right edge. Width is independent of which
  // person is selected (isn't reset by the lastPersonId check below) — a
  // width the user picks should stick as they browse.
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const asideRef = useRef(null)

  function handleResizeStart(event) {
    event.preventDefault()
    const startLeft = asideRef.current?.getBoundingClientRect().left ?? 0
    setIsResizing(true)

    function handleMouseMove(moveEvent) {
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_RATIO
      const next = moveEvent.clientX - startLeft
      setPanelWidth(Math.min(Math.max(next, MIN_PANEL_WIDTH), maxWidth))
    }
    function handleMouseUp() {
      setIsResizing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const [uploadState, uploadFormAction, uploadPending] = useActionState(
    personId ? uploadPersonPhoto.bind(null, personId) : noopAction,
    initialUploadState,
  )

  // A newly selected person starts in read-only view, not mid-edit of
  // whoever was previously selected — adjusted during render (React's
  // documented pattern for resetting state on a prop change) rather than
  // an effect, since PersonPanel stays mounted across selections so the
  // slide transition can animate.
  const [lastPersonId, setLastPersonId] = useState(personId)
  if (personId !== lastPersonId) {
    setLastPersonId(personId)
    setIsEditingBio(false)
    setBioError(null)
  }

  async function handleSaveBio() {
    if (!personId || !editorRef.current) return
    setBioPending(true)
    setBioError(null)
    const formData = new FormData()
    formData.set('bio', editorRef.current.getMarkdown())
    const result = await updatePersonBio(personId, null, formData)
    setBioPending(false)
    if (result.error) {
      setBioError(result.error)
      return
    }
    setIsEditingBio(false)
  }

  // Called by MDXEditor's image plugin whenever an image is inserted —
  // via its toolbar button, paste, or drag-and-drop. The uploaded image
  // is still an ordinary `photos` row (so it also shows up in the
  // gallery below); MDXEditor inserts the resolved URL as a real image
  // node in the document itself. See specs/bio-editor/spec.md.
  async function handleEditorImageUpload(file) {
    if (!personId) throw new Error('No person selected')
    const formData = new FormData()
    formData.set('file', file)
    const result = await uploadPersonPhoto(personId, null, formData)
    if (result.error) throw new Error(result.error)
    return result.photos[0].url
  }

  return (
    <>
      <aside
        ref={asideRef}
        className={`person-panel${isOpen ? ' person-panel--open' : ''}${isResizing ? ' person-panel--resizing' : ''}`}
        style={{ width: isOpen ? panelWidth : 0 }}
      >
        <div className="person-panel__inner" style={{ width: panelWidth }}>
          {details && (
            <>
              <div className="person-panel__header">
                <h2>
                  {details.name}
                  {details.born ? ` (b. ${details.born})` : ''}
                </h2>
                <button type="button" className="person-panel__close" onClick={onClose} aria-label="Close">
                  ×
                </button>
              </div>

              <section className="person-panel__section">
                <div className="person-panel__section-header">
                  <h3>About</h3>
                  {!isEditingBio && (
                    <button
                      type="button"
                      className="person-panel__icon-button"
                      aria-label="Edit bio"
                      onClick={() => setIsEditingBio(true)}
                    >
                      ✎
                    </button>
                  )}
                </div>

                {isEditingBio ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      handleSaveBio()
                    }}
                  >
                    <MDXEditor
                      ref={editorRef}
                      markdown={details.bio}
                      className="person-panel__editor"
                      contentEditableClassName="person-panel__editor-content"
                      plugins={[
                        headingsPlugin(),
                        listsPlugin(),
                        linkPlugin(),
                        linkDialogPlugin(),
                        imagePlugin({ imageUploadHandler: handleEditorImageUpload }),
                        toolbarPlugin({
                          toolbarContents: () => (
                            <>
                              <UndoRedo />
                              <Separator />
                              <BoldItalicUnderlineToggles />
                              <Separator />
                              <BlockTypeSelect />
                              <Separator />
                              <ListsToggle />
                              <Separator />
                              <CreateLink />
                              <InsertImage />
                            </>
                          ),
                        }),
                      ]}
                    />
                    {bioError && <p className="person-panel__error">{bioError}</p>}
                    <div className="person-panel__form-actions">
                      <button type="button" onClick={() => setIsEditingBio(false)} disabled={bioPending}>
                        Cancel
                      </button>
                      <button type="submit" disabled={bioPending}>
                        {bioPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="person-panel__bio">
                    {details.bio ? (
                      <ReactMarkdown>{details.bio}</ReactMarkdown>
                    ) : (
                      <p className="person-panel__empty">No bio yet.</p>
                    )}
                  </div>
                )}
              </section>

              <section className="person-panel__section">
                <h3>Photos</h3>
                <div className="person-panel__photos">
                  {details.photos.length === 0 && <p className="person-panel__empty">No photos yet.</p>}
                  {details.photos.map((photo) => (
                    <div className="person-panel__photo" key={photo.id}>
                      <img src={photo.url} alt={photo.caption ?? ''} />
                      <form action={deletePersonPhoto.bind(null, photo.id)}>
                        <button type="submit" className="person-panel__photo-delete" aria-label="Delete photo">
                          ×
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
                <form action={uploadFormAction} className="person-panel__upload-form">
                  <input type="file" name="file" accept="image/*" multiple required />
                  <input type="text" name="caption" placeholder="Caption (optional, applies to all selected)" />
                  <button type="submit" disabled={uploadPending}>
                    {uploadPending ? 'Uploading…' : 'Upload photos'}
                  </button>
                </form>
                {uploadState.error && <p className="person-panel__error">{uploadState.error}</p>}
              </section>
            </>
          )}
        </div>
      </aside>
      {isOpen && (
        <div
          className={`person-panel__resize-handle${isResizing ? ' person-panel__resize-handle--active' : ''}`}
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
        />
      )}
    </>
  )
}
