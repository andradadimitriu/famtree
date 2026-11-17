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
  setProfilePhoto,
  deletePerson,
  linkPerson,
  unlinkPerson,
} from '../db/actions'
import { formatPartialDate, parsePartialDate } from '../lib/partialDate'
import { getParentState, findMarriage } from '../lib/parentState'
import './PersonPanel.css'

const noopAction = async (state) => state
const initialUploadState = { error: null, photos: [] }
const DEFAULT_PANEL_WIDTH = 360
const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH_RATIO = 0.7

// Renders nothing when no profile photo is set — no placeholder. See
// specs/profile-photo/spec.md.
function PersonAvatar({ url, size = 'md' }) {
  if (!url) return null
  return (
    <span className={`person-panel__avatar person-panel__avatar--${size}`}>
      <img src={url} alt="" />
    </span>
  )
}

// Slide-in panel for a person's Markdown bio + photo gallery. See
// specs/person-details/spec.md. Always mounted (even when closed) so the
// slide transition can animate; `details` is only non-null while a
// person is selected. No backdrop/modal behavior — the tree behind it
// stays fully visible and interactive; the panel only closes via the ×
// button.
export default function PersonPanel({
  personId,
  details,
  people,
  marriages,
  parentage,
  onClose,
  onPersonUpdated,
  onTreeMutated,
}) {
  const isOpen = Boolean(personId)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const [isLinking, setIsLinking] = useState(false)
  const [linkPending, setLinkPending] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [relationship, setRelationship] = useState('')
  const [parent1Id, setParent1Id] = useState('')
  const [parent2Id, setParent2Id] = useState('')
  const [otherParentId, setOtherParentId] = useState('')
  const [childId, setChildId] = useState('')
  const [spouseId, setSpouseId] = useState('')

  const [isUnlinking, setIsUnlinking] = useState(false)
  const [unlinkPending, setUnlinkPending] = useState(false)
  const [unlinkError, setUnlinkError] = useState(null)
  const [unlinkCategory, setUnlinkCategory] = useState('')
  const [removeParentIds, setRemoveParentIds] = useState([])
  const [unlinkChildId, setUnlinkChildId] = useState('')
  const [unlinkSpouseId, setUnlinkSpouseId] = useState('')
  const [keepParentId, setKeepParentId] = useState('')

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

  // Profile-photo picker (upload new / choose existing / remove) only
  // stages a choice — the preview above the buttons updates right away,
  // but it isn't written as this person's profile photo until the
  // identity form's own Save is pressed (`handleSaveIdentity` below).
  // `undefined` = no staged change (show `details.profilePhotoUrl`
  // as-is); `null` = staged removal; `{ id, url }` = staged selection.
  // See specs/profile-photo/spec.md.
  const [avatarPending, setAvatarPending] = useState(false)
  const [avatarError, setAvatarError] = useState(null)
  const [isChoosingAvatarPhoto, setIsChoosingAvatarPhoto] = useState(false)
  const [stagedProfilePhoto, setStagedProfilePhoto] = useState(undefined)

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
    setIsChoosingAvatarPhoto(false)
    setAvatarError(null)
    setStagedProfilePhoto(undefined)
    setConfirmingDelete(false)
    setDeleteError(null)
    setIsLinking(false)
    setLinkError(null)
    setIsUnlinking(false)
    setUnlinkError(null)
  }

  // All people except the one whose panel this is — a person can't be
  // linked to themselves. Sorted by name for a stable, scannable dropdown.
  const peopleList = Object.entries(people ?? {})
    .filter(([id]) => id !== personId)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const selfParentState = getParentState(personId, marriages ?? [], parentage ?? [])

  // `people` only carries `born` (see queries.js's getTreeData), not
  // `died` — enough to tell two same-named people apart in a dropdown.
  function personLabel(p) {
    return p.born ? `${p.name} (b. ${formatPartialDate(p.born)})` : p.name
  }

  function resetLinkFields() {
    setRelationship('')
    setParent1Id('')
    setParent2Id('')
    setOtherParentId('')
    setChildId('')
    setSpouseId('')
    setLinkError(null)
  }

  function startLinking() {
    resetLinkFields()
    setIsLinking(true)
  }

  function handleRelationshipChange(value) {
    setRelationship(value)
    setParent1Id('')
    setParent2Id('')
    setOtherParentId('')
    setChildId('')
    setSpouseId('')
    setLinkError(null)
  }

  function canSubmitLink() {
    if (relationship === 'child-of') {
      return selfParentState.state === 'none' ? Boolean(parent1Id) : Boolean(otherParentId)
    }
    if (relationship === 'parent-of') return Boolean(childId)
    if (relationship === 'spouse-of') return Boolean(spouseId)
    return false
  }

  async function handleSaveLink() {
    if (!personId) return
    setLinkPending(true)
    setLinkError(null)
    const formData = new FormData()
    formData.set('relationship', relationship)
    if (relationship === 'child-of') {
      if (selfParentState.state === 'none') {
        formData.set('parent1Id', parent1Id)
        if (parent2Id) formData.set('parent2Id', parent2Id)
      } else {
        formData.set('otherParentId', otherParentId)
      }
    } else if (relationship === 'parent-of') {
      formData.set('childId', childId)
    } else if (relationship === 'spouse-of') {
      formData.set('spouseId', spouseId)
    }
    const result = await linkPerson(personId, null, formData)
    setLinkPending(false)
    if (result.error) {
      setLinkError(result.error)
      return
    }
    setIsLinking(false)
    onTreeMutated(result)
  }

  // X's actual recorded parents (0, 1, or 2) — not an arbitrary picklist,
  // see specs/unlink-from/spec.md.
  const currentParents = (() => {
    const row = (parentage ?? []).find((p) => p.childId === personId)
    if (!row) return []
    const marriage = (marriages ?? []).find((m) => m.id === row.marriageId)
    return (marriage?.spouses ?? []).map((id) => ({ id, ...(people ?? {})[id] }))
  })()

  // Every child linked to any marriage X is a spouse in.
  const currentChildren = (() => {
    const ownMarriageIds = new Set(
      (marriages ?? []).filter((m) => m.spouses.includes(personId)).map((m) => m.id),
    )
    return (parentage ?? [])
      .filter((p) => ownMarriageIds.has(p.marriageId))
      .map((p) => ({ id: p.childId, ...(people ?? {})[p.childId] }))
  })()

  // X's real (fully-known) spouses only — an Unknown-placeholder marriage
  // has no real spouse to unlink from. See specs/unlink-from/spec.md.
  const currentSpouses = (marriages ?? [])
    .filter((m) => m.spouses.length === 2 && m.spouses.includes(personId))
    .map((m) => {
      const spouseId = m.spouses.find((id) => id !== personId)
      return { id: spouseId, ...(people ?? {})[spouseId] }
    })

  const selectedSpouseMarriage = unlinkSpouseId ? findMarriage(marriages ?? [], personId, unlinkSpouseId) : null
  const selectedSpouseChildren = selectedSpouseMarriage
    ? (parentage ?? []).filter((p) => p.marriageId === selectedSpouseMarriage.id)
    : []

  function resetUnlinkFields() {
    setUnlinkCategory('')
    setRemoveParentIds([])
    setUnlinkChildId('')
    setUnlinkSpouseId('')
    setKeepParentId('')
    setUnlinkError(null)
  }

  function startUnlinking() {
    resetUnlinkFields()
    setIsUnlinking(true)
  }

  function handleUnlinkCategoryChange(value) {
    setUnlinkCategory(value)
    setRemoveParentIds(value === 'parents' && currentParents.length === 1 ? [currentParents[0].id] : [])
    setUnlinkChildId('')
    setUnlinkSpouseId('')
    setKeepParentId('')
    setUnlinkError(null)
  }

  function toggleRemoveParent(id) {
    setRemoveParentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function unlinkSummary() {
    if (unlinkCategory === 'parents' && removeParentIds.length > 0) {
      const names = removeParentIds
        .map((id) => currentParents.find((p) => p.id === id)?.name)
        .join(' and ')
      return `Remove ${names} as ${removeParentIds.length > 1 ? 'parents' : 'a parent'} of ${details.name}?`
    }
    if (unlinkCategory === 'children' && unlinkChildId) {
      const child = currentChildren.find((c) => c.id === unlinkChildId)
      return `Remove ${details.name} as a parent of ${child?.name}?`
    }
    if (unlinkCategory === 'spouse' && unlinkSpouseId) {
      if (selectedSpouseChildren.length > 0 && !keepParentId) return null
      const spouse = currentSpouses.find((s) => s.id === unlinkSpouseId)
      return `End the marriage between ${details.name} and ${spouse?.name}?`
    }
    return null
  }

  function canSubmitUnlink() {
    if (unlinkCategory === 'parents') return removeParentIds.length > 0
    if (unlinkCategory === 'children') return Boolean(unlinkChildId)
    if (unlinkCategory === 'spouse') {
      if (!unlinkSpouseId) return false
      return selectedSpouseChildren.length > 0 ? Boolean(keepParentId) : true
    }
    return false
  }

  async function handleSaveUnlink() {
    if (!personId) return
    setUnlinkPending(true)
    setUnlinkError(null)
    const formData = new FormData()
    formData.set('category', unlinkCategory)
    if (unlinkCategory === 'parents') {
      removeParentIds.forEach((id) => formData.append('removeParentId', id))
    } else if (unlinkCategory === 'children') {
      formData.set('childId', unlinkChildId)
    } else if (unlinkCategory === 'spouse') {
      formData.set('spouseId', unlinkSpouseId)
      if (selectedSpouseChildren.length > 0) formData.set('keepParentId', keepParentId)
    }
    const result = await unlinkPerson(personId, null, formData)
    setUnlinkPending(false)
    if (result.error) {
      setUnlinkError(result.error)
      return
    }
    setIsUnlinking(false)
    onTreeMutated(result)
  }

  // Stages a choice locally — the preview above the buttons updates
  // immediately, but nothing is written to this person's record until
  // handleSaveIdentity below. `photo: null` stages a removal.
  function stageProfilePhoto(photo) {
    setStagedProfilePhoto(photo)
    setIsChoosingAvatarPhoto(false)
  }

  // Uploading a *new* file still has to actually upload it right away
  // (there's no draft/staging area on the server for a raw file) — the
  // photo is created as an ordinary gallery row immediately, same as
  // any other gallery upload. Only the "this is the profile photo" part
  // is staged, same as choosing an existing one.
  async function handleUploadProfilePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !personId) return
    setAvatarPending(true)
    setAvatarError(null)
    const formData = new FormData()
    formData.set('file', file)
    const uploadResult = await uploadPersonPhoto(personId, null, formData)
    setAvatarPending(false)
    if (uploadResult.error) {
      setAvatarError(uploadResult.error)
      return
    }
    const photo = uploadResult.photos[0]
    stageProfilePhoto({ id: photo.id, url: photo.url })
  }

  function startEditingIdentity() {
    setNameInput(details.name)
    setBornInput(details.born ?? '')
    setDiedInput(details.died ?? '')
    setIdentityError(null)
    setIsChoosingAvatarPhoto(false)
    setAvatarError(null)
    setStagedProfilePhoto(undefined)
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
    if (result.error) {
      setIdentityPending(false)
      setIdentityError(result.error)
      return
    }

    let profilePhotoUrl = details.profilePhotoUrl
    if (stagedProfilePhoto !== undefined) {
      const photoResult = await setProfilePhoto(personId, stagedProfilePhoto ? stagedProfilePhoto.id : null)
      if (photoResult.error) {
        setIdentityPending(false)
        setIdentityError(photoResult.error)
        return
      }
      profilePhotoUrl = photoResult.profilePhotoUrl
    }

    setIdentityPending(false)
    setIsEditingIdentity(false)
    setIsChoosingAvatarPhoto(false)
    setStagedProfilePhoto(undefined)
    onPersonUpdated(personId, {
      name: nameInput.trim(),
      born: parsePartialDate(bornInput).value ?? undefined,
      died: parsePartialDate(diedInput).value ?? undefined,
      profilePhotoUrl,
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

  // Staged-aware view of the profile photo for the identity form's
  // preview/grid — `undefined` means no staged change, so fall back to
  // the persisted value. See stageProfilePhoto's comment.
  const previewProfilePhotoUrl = stagedProfilePhoto === undefined ? details?.profilePhotoUrl : stagedProfilePhoto?.url
  const previewProfilePhotoId = stagedProfilePhoto === undefined ? details?.profilePhotoId : stagedProfilePhoto?.id

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
                    <div className="person-panel__field">
                      <span>Profile picture</span>
                      <div className="person-panel__avatar-field">
                        <PersonAvatar url={previewProfilePhotoUrl} size="lg" />
                        <div className="person-panel__avatar-controls">
                          <label className="person-panel__avatar-button">
                            Upload new
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={avatarPending}
                              onChange={handleUploadProfilePhoto}
                            />
                          </label>
                          {details.photos.length > 0 && (
                            <button
                              type="button"
                              className="person-panel__avatar-button"
                              disabled={avatarPending}
                              onClick={() => setIsChoosingAvatarPhoto((prev) => !prev)}
                            >
                              Choose existing
                            </button>
                          )}
                          {previewProfilePhotoUrl && (
                            <button
                              type="button"
                              className="person-panel__avatar-button"
                              disabled={avatarPending}
                              onClick={() => stageProfilePhoto(null)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {isChoosingAvatarPhoto && (
                          <div className="person-panel__avatar-grid">
                            {details.photos.map((photo) => (
                              <button
                                type="button"
                                key={photo.id}
                                className={`person-panel__avatar-grid-item${
                                  photo.id === previewProfilePhotoId
                                    ? ' person-panel__avatar-grid-item--selected'
                                    : ''
                                }`}
                                disabled={avatarPending}
                                onClick={() => stageProfilePhoto({ id: photo.id, url: photo.url })}
                                aria-label="Use this photo as profile photo"
                              >
                                <img src={photo.url} alt={photo.caption ?? ''} />
                              </button>
                            ))}
                          </div>
                        )}
                        {avatarError && <p className="person-panel__error">{avatarError}</p>}
                      </div>
                    </div>
                    <div className="person-panel__form-actions">
                      <button
                        type="button"
                        className="person-panel__danger-button"
                        onClick={() => {
                          setIsEditingIdentity(false)
                          setIsChoosingAvatarPhoto(false)
                          setAvatarError(null)
                          setStagedProfilePhoto(undefined)
                        }}
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

              {/* Read-only display — edited only via the pencil-icon
                  identity form above, not interactive itself. Renders
                  nothing when no profile photo is set — no placeholder.
                  See specs/profile-photo/spec.md. */}
              {details.profilePhotoUrl && (
                <div className="person-panel__profile-photo">
                  <img src={details.profilePhotoUrl} alt="" />
                </div>
              )}

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
                ) : isLinking ? (
                  <form
                    className="person-panel__link-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      handleSaveLink()
                    }}
                  >
                    <label className="person-panel__field">
                      <span>Relationship</span>
                      <select
                        value={relationship}
                        onChange={(event) => handleRelationshipChange(event.target.value)}
                      >
                        <option value="">Choose…</option>
                        <option value="child-of" disabled={selfParentState.state === 'two'}>
                          Child of{selfParentState.state === 'two' ? ' — already has 2 parents' : ''}
                        </option>
                        <option value="parent-of">Parent of</option>
                        <option value="spouse-of">Spouse of</option>
                      </select>
                    </label>

                    {relationship === 'child-of' && selfParentState.state === 'none' && (
                      <>
                        <label className="person-panel__field">
                          <span>Parent 1</span>
                          <select value={parent1Id} onChange={(event) => setParent1Id(event.target.value)}>
                            <option value="">Choose…</option>
                            {peopleList
                              .filter((p) => p.id !== parent2Id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {personLabel(p)}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="person-panel__field">
                          <span>Parent 2</span>
                          <select value={parent2Id} onChange={(event) => setParent2Id(event.target.value)}>
                            <option value="">Unknown</option>
                            {peopleList
                              .filter((p) => p.id !== parent1Id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {personLabel(p)}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    )}

                    {relationship === 'child-of' && selfParentState.state === 'one' && (
                      <label className="person-panel__field">
                        <span>Other parent</span>
                        <select
                          value={otherParentId}
                          onChange={(event) => setOtherParentId(event.target.value)}
                        >
                          <option value="">Choose…</option>
                          {peopleList
                            .filter((p) => p.id !== selfParentState.knownParentId)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {personLabel(p)}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                    {relationship === 'parent-of' && (
                      <label className="person-panel__field">
                        <span>Child</span>
                        <select value={childId} onChange={(event) => setChildId(event.target.value)}>
                          <option value="">Choose…</option>
                          {peopleList
                            .filter(
                              (p) => getParentState(p.id, marriages ?? [], parentage ?? []).state !== 'two',
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {personLabel(p)}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                    {relationship === 'spouse-of' && (
                      <label className="person-panel__field">
                        <span>Spouse</span>
                        <select value={spouseId} onChange={(event) => setSpouseId(event.target.value)}>
                          <option value="">Choose…</option>
                          {peopleList
                            .filter((p) => !findMarriage(marriages ?? [], personId, p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {personLabel(p)}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                    {linkError && <p className="person-panel__error">{linkError}</p>}
                    <div className="person-panel__form-actions">
                      <button type="button" onClick={() => setIsLinking(false)} disabled={linkPending}>
                        Cancel
                      </button>
                      <button type="submit" disabled={linkPending || !canSubmitLink()}>
                        {linkPending ? 'Linking…' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : isUnlinking ? (
                  <form
                    className="person-panel__link-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      handleSaveUnlink()
                    }}
                  >
                    <label className="person-panel__field">
                      <span>Unlink</span>
                      <select
                        value={unlinkCategory}
                        onChange={(event) => handleUnlinkCategoryChange(event.target.value)}
                      >
                        <option value="">Choose…</option>
                        <option value="parents" disabled={currentParents.length === 0}>
                          Parents{currentParents.length === 0 ? ' — none recorded' : ''}
                        </option>
                        <option value="children" disabled={currentChildren.length === 0}>
                          Children{currentChildren.length === 0 ? ' — none recorded' : ''}
                        </option>
                        <option value="spouse" disabled={currentSpouses.length === 0}>
                          Spouse{currentSpouses.length === 0 ? ' — none recorded' : ''}
                        </option>
                      </select>
                    </label>

                    {unlinkCategory === 'parents' && currentParents.length === 1 && (
                      <div className="person-panel__field">
                        <span>Parent</span>
                        {currentParents[0].name}
                      </div>
                    )}

                    {unlinkCategory === 'parents' && currentParents.length === 2 && (
                      <div className="person-panel__field">
                        <span>Parents to remove</span>
                        {currentParents.map((p) => (
                          <label key={p.id} className="person-panel__checkbox-row">
                            <input
                              type="checkbox"
                              checked={removeParentIds.includes(p.id)}
                              onChange={() => toggleRemoveParent(p.id)}
                            />
                            {personLabel(p)}
                          </label>
                        ))}
                      </div>
                    )}

                    {unlinkCategory === 'children' && (
                      <label className="person-panel__field">
                        <span>Child</span>
                        <select
                          value={unlinkChildId}
                          onChange={(event) => setUnlinkChildId(event.target.value)}
                        >
                          <option value="">Choose…</option>
                          {currentChildren.map((c) => (
                            <option key={c.id} value={c.id}>
                              {personLabel(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {unlinkCategory === 'spouse' && (
                      <>
                        <label className="person-panel__field">
                          <span>Spouse</span>
                          <select
                            value={unlinkSpouseId}
                            onChange={(event) => {
                              setUnlinkSpouseId(event.target.value)
                              setKeepParentId('')
                            }}
                          >
                            <option value="">Choose…</option>
                            {currentSpouses.map((s) => (
                              <option key={s.id} value={s.id}>
                                {personLabel(s)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {unlinkSpouseId && selectedSpouseChildren.length > 0 && (
                          <div className="person-panel__field">
                            <span>Who keeps the children?</span>
                            <label className="person-panel__checkbox-row">
                              <input
                                type="radio"
                                name="keepParent"
                                checked={keepParentId === personId}
                                onChange={() => setKeepParentId(personId)}
                              />
                              {details.name}
                            </label>
                            <label className="person-panel__checkbox-row">
                              <input
                                type="radio"
                                name="keepParent"
                                checked={keepParentId === unlinkSpouseId}
                                onChange={() => setKeepParentId(unlinkSpouseId)}
                              />
                              {currentSpouses.find((s) => s.id === unlinkSpouseId)?.name}
                            </label>
                          </div>
                        )}
                      </>
                    )}

                    {unlinkSummary() && <p className="person-panel__unlink-summary">{unlinkSummary()}</p>}
                    {unlinkError && <p className="person-panel__error">{unlinkError}</p>}
                    <div className="person-panel__form-actions">
                      <button type="button" onClick={() => setIsUnlinking(false)} disabled={unlinkPending}>
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="person-panel__danger-button"
                        disabled={unlinkPending || !canSubmitUnlink()}
                      >
                        {unlinkPending ? 'Unlinking…' : 'Unlink'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="person-panel__actions-buttons">
                    <div className="person-panel__actions-row">
                      <button type="button" className="person-panel__secondary-button" onClick={startLinking}>
                        Link to
                      </button>
                      <button
                        type="button"
                        className="person-panel__secondary-button"
                        onClick={startUnlinking}
                      >
                        Unlink from
                      </button>
                    </div>
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
