import Image from 'next/image';
import { LoginForm } from '@/app/(public)/_components/LoginForm';

const LogoWithText = () => {
    return (
        <div className="flex items-center gap-2">
            <div className="bg-white border border-primary text-primary-foreground flex size-8 items-center justify-center rounded-full">
                <Image src="/aixellabs.svg" alt="Aixel Labs" width={24} height={24} className="size-full object-cover" />
            </div>
            <span className="text-lg">Aixel Labs</span>
        </div>
    );
};

export default function SignInPage() {
    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <LogoWithText />
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <LoginForm />
                    </div>
                </div>
            </div>
            <div className="bg-muted relative hidden md:block">
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                    <LogoWithText />
                    <div className="max-w-md space-y-4 text-center">
                        <h2 className="text-3xl font-bold tracking-tight">Welcome to Aixel Labs</h2>
                        <p className="text-muted-foreground text-lg">
                            Your all-in-one platform for lead generation, voice agents, messaging, and email outreach.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
