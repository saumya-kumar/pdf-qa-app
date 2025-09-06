// app/page.tsx (Server Component)
import HomeClient from './_components/HomeClient';

export const dynamic = 'force-dynamic'; // avoid static prerender since page depends on client state
export const revalidate = 0;

export default function Page() {
  return <HomeClient />;
}
