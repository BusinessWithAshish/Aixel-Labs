import { NestedLayoutWrapper } from '@/components/common/RootLayout';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return <NestedLayoutWrapper>{children}</NestedLayoutWrapper>;
}
