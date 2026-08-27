import AppHeader from './AppHeader'

/** Placeholder for sections not built yet — En vivo is the priority view. */
export default function RouteStub({ title, note }: { title: string; note: string }) {
  return (
    <>
      <AppHeader />
      <div className="motm-stub">
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
    </>
  )
}
