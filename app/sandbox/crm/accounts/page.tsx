"use client";
import { useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, PageHeader, PageSkeleton, Table } from "../_components/ui";
import s from "../crm.module.css";

export default function AccountsPage() {
  usePageTitle("Accounts");
  const db = useDb();
  if (!db) return <PageSkeleton />;

  return (
    <>
      <PageHeader title="Accounts" description={`${db.accounts.length} accounts`} />
      <Card bodyClassName="p-0">
        <Table caption="Accounts">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Name</th>
              <th scope="col">Industry</th>
              <th scope="col">Region</th>
              <th scope="col">Owner</th>
              <th scope="col" className={s.tdRight}>
                Contacts
              </th>
              <th scope="col" className={s.tdRight}>
                Opportunities
              </th>
            </tr>
          </thead>
          <tbody>
            {db.accounts.map((account) => (
              <tr key={account.id}>
                <td className={s.num}>{account.id}</td>
                <td className="font-semibold">{account.name}</td>
                <td>{account.industry}</td>
                <td>{account.region}</td>
                <td>{account.owner}</td>
                <td className={s.tdRight}>{db.contacts.filter((c) => c.accountId === account.id).length}</td>
                <td className={s.tdRight}>{db.opportunities.filter((o) => o.accountId === account.id).length}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
