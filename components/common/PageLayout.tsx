import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageLayoutProps = {
  children: ReactNode;
  className?: string;
  title: string;
}

export default function PageLayout(props: PageLayoutProps){

  return (
    <div className={cn('h-full px-6 py-3 w-full space-y-4', props.className)}>
      <div className='flex font-bold text-2xl h-[5%] min-h-fit items-center'>
        {props.title}
      </div>

      <div className='h-[95%] space-y-4 w-full'>
        {props.children}
      </div>
    </div>
  )

};