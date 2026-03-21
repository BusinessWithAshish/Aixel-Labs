import Link from "next/link";
import { DEFAULT_HOME_PAGE_ROUTE } from "@/config/app-config";

export const CommonNotFound = () => {

    return (
        <div className="flex flex-col items-center justify-center h-full">
            <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
            <p className="text-lg">The page you are looking for does not exist.</p>
            <Link href={DEFAULT_HOME_PAGE_ROUTE} className="text-primary">
                Go back to the home page
            </Link>
        </div>
    );
};