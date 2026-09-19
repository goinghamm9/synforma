"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MATERIAL_GROUPS, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Breadcrumb, Card, EmptyState, Field, PageHeader, PageSkeleton, StatusBadge, Table, inputClass, selectClass } from "../_components/ui";
import s from "../erp.module.css";

export default function SuppliersPage() {
  usePageTitle("Manage Suppliers");
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("All");

  if (!db) return <PageSkeleton />;

  const needle = query.trim().toLowerCase();
  const rows = db.suppliers
    .filter((supplier) => (category === "All" ? true : supplier.category === category))
    .filter((supplier) => (needle ? [supplier.id, supplier.name, supplier.city, supplier.country, supplier.contactName].some((v) => v.toLowerCase().includes(needle)) : true));

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "Manage Suppliers" }]} />
      <PageHeader title="Manage Suppliers" description={`${db.suppliers.length} suppliers · ${rows.length} shown`} />
      <Card bodyClassName="p-0">
        <div className={s.filterBar}>
          <Field id="supplier-search" label="Search">
            {({ id }) => (
              <input id={id} type="search" className={inputClass} placeholder="Supplier, name, city or contact" value={query} onChange={(event) => setQuery(event.target.value)} />
            )}
          </Field>
          <Field id="supplier-category" label="Category">
            {({ id }) => (
              <select id={id} className={selectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="All">All categories</option>
                {MATERIAL_GROUPS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No suppliers match" description="Try a different search term or clear the category filter." />
        ) : (
          <Table caption="Suppliers">
            <thead>
              <tr>
                <th scope="col">Supplier</th>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Location</th>
                <th scope="col">Payment terms</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((supplier) => {
                const href = `/sandbox/erp/suppliers/${supplier.id}`;
                return (
                  <tr
                    key={supplier.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {supplier.id}
                      </Link>
                    </td>
                    <td>{supplier.name}</td>
                    <td>{supplier.category}</td>
                    <td>
                      {supplier.city}, {supplier.country}
                    </td>
                    <td>{supplier.paymentTerms}</td>
                    <td>
                      <StatusBadge status={supplier.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
