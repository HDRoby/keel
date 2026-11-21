// Not found: a project, document or template that does not exist (or an unsafe address).
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="content">
      <h1>Not found</h1>
      <p>There is nothing at this address. It may have been removed, or the link is wrong.</p>
      <p><Link href="/">Back to Projects</Link></p>
    </main>
  );
}
