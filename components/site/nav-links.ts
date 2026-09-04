export interface NavLink {
  href: string;
  label: string;
}

/** Primary navigation. Hash links are absolute so they resolve from any route. */
export const NAV_LINKS: NavLink[] = [
  { href: "/thesis", label: "Thesis" },
  { href: "/#how", label: "How it works" },
  { href: "/#trust", label: "Trust" },
  { href: "/graph", label: "Work Graph" },
];

export const FOOTER_LINKS: NavLink[] = [
  { href: "/demo", label: "Demo" },
  { href: "/graph", label: "Work Graph" },
  { href: "/thesis", label: "Thesis" },
  { href: "/#trust", label: "Trust" },
];
