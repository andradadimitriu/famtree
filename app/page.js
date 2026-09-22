import FamilyTree from '../src/components/FamilyTree'
import { getFamilyData } from '../src/db/queries'

// The DB is read fresh on every request rather than baked into a static
// build — relevant once there's an edit UI, but true from the start.
export const dynamic = 'force-dynamic'

export default function Home() {
  const { people, marriages, parentage, rootId } = getFamilyData()

  return (
    <div className="app">
      <header className="app__header">
        <h1>Family Tree</h1>
        <p>Click a node to expand or collapse its descendants.</p>
      </header>
      <main className="app__main">
        <FamilyTree people={people} marriages={marriages} parentage={parentage} rootId={rootId} />
      </main>
    </div>
  )
}
