import { href } from '../router';

export function NotFound({ message = "This page doesn't exist." }: { message?: string }) {
  return (
    <main className="page">
      <p>{message}</p>
      <p>
        <a href={href({ name: 'library' })}>Back to your productions</a>
      </p>
    </main>
  );
}
