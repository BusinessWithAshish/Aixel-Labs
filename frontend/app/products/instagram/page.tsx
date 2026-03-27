'use client';

import { ZodStringField } from "@/components/common/zod-form-builder/ZodFieldComponents";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

const INSTAGRAM_USERNAME_REGEX = /^[a-zA-Z0-9_.]+$/;
const INSTAGRAM_URL_REGEX = /https:\/\/www\.instagram\.com\/[a-zA-Z0-9_.]+/;

type INSTAGRAM_RESPONSE = {
    id: string | null;
    fullName: string | null;
    username: string | null;
    instagramUrl: string | null;
    websites: string[] | null;
    bio: string | null;
    bioHashtags: string[] | null;
    bioMentions: string[] | null;
    followers: number | null;
    following: number | null;
    posts: number | null;
    profilePicture: string | null;
    profilePictureHd: string | null;
    isVerified: boolean | null;
    isBusiness: boolean | null;
    isProfessional: boolean | null;
    isPrivate: boolean | null;
    isJoinedRecently: boolean | null;
    businessEmail: string | null;
    businessPhoneNumber: string | null;
    businessCategoryName: string | null;
    overallCategoryName: string | null;
    businessAddressJson: string | null;
    latestPostUrls: string[] | null;
};

export default function InstagramProductsPage() {

    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [accountProfile, setAccountProfile] = useState<INSTAGRAM_RESPONSE | null>(null);

    const findAccountProfile = async (entity: string) => {
        setIsLoading(true);
        try {
            if (!INSTAGRAM_USERNAME_REGEX.test(entity) && !INSTAGRAM_URL_REGEX.test(entity)) {
                toast.error("Invalid username or URL");
                return;
            }

            const res = await fetch(`/api/instagram/profile?username=${encodeURIComponent(entity)}`);
            const json = await res.json();

            if (!res.ok || !json.success) {
                toast.error(json.error ?? "Failed to fetch account profile");
                setAccountProfile(null);
                return;
            }

            setAccountProfile(json.data as INSTAGRAM_RESPONSE);
        } catch {
            toast.error("Failed to fetch account profile");
            setAccountProfile(null);
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <Card className="max-h-[90%] max-w-[90%] self-center">
            <CardHeader>
                <CardTitle>Instagram private account viewer</CardTitle>
                <CardDescription>
                    <span>View private Instagram accounts without being logged in.</span>
                    <br />
                    <strong className="text-primary italic">(If you&#39;re lucky you might see the top 11 latest posts OR a single random post is atleast confirmed to be from the account)</strong>
                </CardDescription>
                <CardAction>
                    <Button type="button" disabled={isLoading} onClick={() => findAccountProfile(username)}>
                        {isLoading ? "Loading..." : "View account"}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <ZodStringField
                    value={username}
                    onChange={(value) => setUsername(value)}
                    name="username"
                    label="Username or URL"
                    description="Enter the username of the private Instagram account to view"
                    required
                />

                <div className="grid grid-cols-3 overflow-y-auto gap-2 mt-4">
                    {accountProfile?.latestPostUrls?.map((url, i) => (
                        <img
                            key={i}
                            src={`/api/instagram/image?url=${encodeURIComponent(url)}`}
                            alt={`Post ${i + 1}`}
                            className="w-full aspect-square object-cover rounded-md"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
