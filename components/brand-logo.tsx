import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-3 font-extrabold text-white",
        className,
      )}
    >
      <Image
        src="/edutest-logo.svg"
        alt="EduTest.AI"
        width={168}
        height={40}
        className="h-10 w-auto"
        priority
      />
    </Link>
  );
}
