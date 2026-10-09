import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// 帶語言前綴的 Link、useRouter 等，站內連結一律用這裡的版本
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
