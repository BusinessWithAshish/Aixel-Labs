import { BluffRoom } from '../_components/BluffRoom';

export default async function BluffRoomPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = await params;
    return <BluffRoom code={code.toUpperCase()} />;
}
