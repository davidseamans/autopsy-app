export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Placeholder. Not yet wired to backend.
      </p>
    </div>
  );
}