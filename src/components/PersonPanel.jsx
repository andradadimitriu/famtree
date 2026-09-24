'use client'

import { useActionState, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { updatePersonBio, uploadPersonPhoto, deletePersonPhoto } from '../db/actions'
import './PersonPanel.css'

const noopAction = async (state) => state
const initialUploadState = { error: null, photo: null }

// Slide-in panel for a person's Markdown bio + photo gallery. See
// specs/person-details/spec.md. Always mounted (even when closed) so the
// slide transition can animate; `details` is only non-null while a
// person is selected. No backdrop/modal behavior — the tree behind it
// stays fully visible and interactive; the panel only closes via the ×
// button.
export default function PersonPanel({ personId, details, onClose }) {
  const isOpen = Boolean(personId)

  const [isEditingBio, setIsEditingBio] = useState(false)
  const textareaRef = useRef(null)
  const insertImageInputRef = useRef(null)
  const [isInsertingImage, setIsInsertingImage] = useState(false)
  const [insertImageError, setInsertImageError] = useState(null)
  const [bioPending, setBioPending] = useState(false)
  const [bioError, setBioError] = useState(null)

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
    setInsertImageError(null)
    setBioError(null)
  }

  async function handleSaveBio() {
    if (!personId || !textareaRef.current) return
    setBioPending(true)
    setBioError(null)
    const formData = new FormData()
    formData.set('bio', textareaRef.current.value)
    const result = await updatePersonBio(personId, null, formData)
    setBioPending(false)
    if (result.error) {
      setBioError(result.error)
      return
    }
    setIsEditingBio(false)
  }

  async function handleInsertImageFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !personId) return

    setIsInsertingImage(true)
    setInsertImageError(null)
    const formData = new FormData()
    formData.set('file', file)
    const result = await uploadPersonPhoto(personId, null, formData)
    setIsInsertingImage(false)

    if (result.error) {
      setInsertImageError(result.error)
      return
    }

    const textarea = textareaRef.current
    const markdownImage = `![](${result.photo.url})\n`
    if (!textarea) return
    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length
    textarea.value = textarea.value.slice(0, start) + markdownImage + textarea.value.slice(end)
    const cursor = start + markdownImage.length
    textarea.setSelectionRange(cursor, cursor)
    textarea.focus()
  }

  return (
    <aside className={`person-panel${isOpen ? ' person-panel--open' : ''}`}>
      <div className="person-panel__inner">
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
                  <div className="person-panel__editor-toolbar">
                    <button
                      type="button"
                      className="person-panel__icon-button"
                      aria-label="Insert image"
                      onClick={() => insertImageInputRef.current?.click()}
                      disabled={isInsertingImage}
                    >
                      {isInsertingImage ? '…' : '🖼'}
                    </button>
                    <input
                      ref={insertImageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleInsertImageFile}
                    />
                  </div>
                  <textarea
                    ref={textareaRef}
                    name="bio"
                    defaultValue={details.bio}
                    rows={8}
                    className="person-panel__textarea"
                  />
                  {insertImageError && <p className="person-panel__error">{insertImageError}</p>}
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
                <input type="file" name="file" accept="image/*" required />
                <input type="text" name="caption" placeholder="Caption (optional)" />
                <button type="submit" disabled={uploadPending}>
                  {uploadPending ? 'Uploading…' : 'Upload photo'}
                </button>
              </form>
              {uploadState.error && <p className="person-panel__error">{uploadState.error}</p>}
            </section>
          </>
        )}
      </div>
    </aside>
  )
}
