import Link from 'next/link';
import PageLayout from '@/components/common/PageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CONTENT_LAB_JOBS, CONTENT_LAB_VS_STUDIO } from '../_constants';
import { SmartBox } from './_components/SmartBox';

/** Content Lab home: one box that takes a topic, a link or an @creator, plus the three jobs. */
export default function ContentLabSearchPage() {
    return (
        <PageLayout title="Content Lab">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-2">
                <section className="flex flex-col gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">What do you want to make next?</h1>
                    <p className="text-muted-foreground max-w-prose">
                        Type a topic, paste any YouTube or Instagram link, or type an @creator.
                    </p>
                    <SmartBox />
                </section>

                <section className="flex flex-col gap-3">
                    <h2 className="text-muted-foreground text-sm font-medium">Or pick a job</h2>
                    <div className="grid gap-4 md:grid-cols-3">
                        {CONTENT_LAB_JOBS.map((job, index) => (
                            <Link key={job.step} href={job.href} className="group">
                                <Card className="h-full transition-colors group-hover:border-foreground">
                                    <CardHeader>
                                        <span className="text-xs font-medium uppercase tracking-wider text-primary">
                                            {index + 1} · {job.step}
                                        </span>
                                        <CardTitle className="text-lg">{job.title}</CardTitle>
                                        <CardDescription>{job.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <code className="bg-muted rounded px-2 py-1 text-xs break-all">{job.example}</code>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </section>

                <Card>
                    <CardHeader>
                        <CardTitle>Already have YouTube Studio and Instagram insights?</CardTitle>
                        <CardDescription>Keep them. They answer a different question.</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead />
                                    <TableHead>YouTube Studio / IG insights</TableHead>
                                    <TableHead>Content Lab</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {CONTENT_LAB_VS_STUDIO.map((row) => (
                                    <TableRow key={row.label}>
                                        <TableCell className="text-muted-foreground whitespace-normal">{row.label}</TableCell>
                                        <TableCell className="whitespace-normal">{row.studio}</TableCell>
                                        <TableCell className="font-medium whitespace-normal">{row.lab}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </PageLayout>
    );
}
