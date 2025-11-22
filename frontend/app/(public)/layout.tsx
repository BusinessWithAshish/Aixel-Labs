import { RootLayoutUI } from '@/components/common/RootLayout';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return <RootLayoutUI>{children}</RootLayoutUI>;
}
