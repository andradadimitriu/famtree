'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
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
import {
  updatePersonBio,
  updatePersonIdentity,
  uploadPersonPhoto,
  deletePersonPhoto,
  deletePerson,
} from '../db/actions'
import { formatPartialDate, parsePartialDate } from '../lib/partialDate'
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
export default function PersonPanel({ personId, details, onClose, onPersonUpdated, onTreeMutated }) {
  const isOpen = Boolean(personId)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const [isEditingBio, setIsEditingBio] = useState(false)
  const editorRef = useRef(null)
  const [bioPending, setBioPending] = useState(false)
  const [bioError, setBioError] = useState(null)

  const [isEditingIdentity, setIsEditingIdentity] = useState(false)
  const [identityPending, setIdentityPending] = useState(false)
  const [identityError, setIdentityError] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [bornInput, setBornInput] = useState('')
  const [diedInput, setDiedInput] = useState('')

  // MDXEditor ships its own `dark-theme` class covering its full internal
  // palette (dialogs, hover/disabled states, etc. — well beyond the 4
  // vars PersonPanel.css overrides). Starts false and syncs in an effect,
  // not read from matchMedia during render, so the server-rendered and
  // first-hydrated markup match (window isn't available on the server).
  const [isDarkMode, setIsDarkMode] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDarkMode(query.matches)
    const handleChange = (event) => setIsDarkMode(event.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

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
    setIsEditingIdentity(false)
    setIdentityError(null)
    setConfirmingDelete(false)
    setDeleteError(null)
  }

  function startEditingIdentity() {
    setNameInput(details.name)
    setBornInput(details.born ?? '')
    setDiedInput(details.died ?? '')
    setIdentityError(null)
    setIsEditingIdentity(true)
  }

  async function handleSaveIdentity() {
    if (!personId) return
    setIdentityPending(true)
    setIdentityError(null)
    const formData = new FormData()
    formData.set('name', nameInput)
    formData.set('born', bornInput)
    formData.set('died', diedInput)
    const result = await updatePersonIdentity(personId, null, formData)
    setIdentityPending(false)
    if (result.error) {
      setIdentityError(result.error)
      return
    }
    setIsEditingIdentity(false)
    onPersonUpdated(personId, {
      name: nameInput.trim(),
      born: parsePartialDate(bornInput).value ?? undefined,
      died: parsePartialDate(diedInput).value ?? undefined,
    })
  }

  async function handleDeletePerson() {
    if (!personId) return
    setDeletePending(true)
    setDeleteError(null)
    const result = await deletePerson(personId)
    setDeletePending(false)
    if (result.error) {
      setDeleteError(result.error)
      return
    }
    setConfirmingDelete(false)
    onTreeMutated(result)
    onClose()
  }

  // `(b. 1900, d. 1970)` — only the pieces that are actually set.
  function formatLifespan({ born, died }) {
    const parts = [born && `b. ${formatPartialDate(born)}`, died && `d. ${formatPartialDate(died)}`].filter(
      Boolean,
    )
    return parts.length > 0 ? ` (${parts.join(', ')})` : ''
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
                {isEditingIdentity ? (
                  <form
                    className="person-panel__identity-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      handleSaveIdentity()
                    }}
                  >
                    <label className="person-panel__field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                        required
                      />
                    </label>
                    <label className="person-panel__field">
                      <span>Born</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="YYYY, YYYY-MM, or YYYY-MM-DD"
                        value={bornInput}
                        onChange={(event) => setBornInput(event.target.value)}
                      />
                    </label>
                    <label className="person-panel__field">
                      <span>Died</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="YYYY, YYYY-MM, or YYYY-MM-DD"
                        value={diedInput}
                        onChange={(event) => setDiedInput(event.target.value)}
                      />
                    </label>
                    {identityError && <p className="person-panel__error">{identityError}</p>}
                    <div className="person-panel__form-actions">
                      <button
                        type="button"
                        onClick={() => setIsEditingIdentity(false)}
                        disabled={identityPending}
                      >
                        Cancel
                      </button>
                      <button type="submit" disabled={identityPending}>
                        {identityPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="person-panel__heading">
                    <h2>
                      {details.name}
                      {formatLifespan(details)}
                    </h2>
                    <button
                      type="button"
                      className="person-panel__icon-button"
                      aria-label="Edit name and birth year"
                      onClick={startEditingIdentity}
                    >
                      ✎
                    </button>
                  </div>
                )}
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
                      className={`person-panel__editor${isDarkMode ? ' dark-theme' : ''}`}
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

              <section className="person-panel__section">
                <h3>Actions</h3>
                {confirmingDelete ? (
                  <div className="person-panel__delete-confirm">
                    <p>Delete {details.name}? This can&apos;t be undone.</p>
                    {deleteError && <p className="person-panel__error">{deleteError}</p>}
                    <div className="person-panel__form-actions">
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        disabled={deletePending}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="person-panel__danger-button"
                        onClick={handleDeletePerson}
                        disabled={deletePending}
                      >
                        {deletePending ? 'Deleting…' : 'Confirm delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="person-panel__actions-buttons">
                    <button
                      type="button"
                      className="person-panel__danger-button"
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Delete node
                    </button>
                  </div>
                )}
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
