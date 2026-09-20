import FamilyTree from './components/FamilyTree'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Family Tree</h1>
        <p>Click a node to expand or collapse its descendants.</p>
      </header>
      <main className="app__main">
        <FamilyTree />
      </main>
    </div>
  )
}

export default App
