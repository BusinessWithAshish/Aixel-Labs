import { BusinessRoom } from '../_components/BusinessRoom';

export default async function BusinessRoomPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = await params;
    return <BusinessRoom code={code.toUpperCase()} />;
}
