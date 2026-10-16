import { ScreenLoader } from '../_components/Loading';

/** Shown the moment a room's address is opened, while its page is fetched. */
export default function RoomLoading() {
    return <ScreenLoader text="Opening the room…" />;
}
