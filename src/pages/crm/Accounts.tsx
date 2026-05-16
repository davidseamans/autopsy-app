import CrmTablePage from "./CrmTablePage";

export default function Accounts() {
  return (
    <CrmTablePage
      title="Accounts"
      table="accounts"
      newLabel="+ New Account"
      columns={[
        { key: "name", label: "Name" },
        { key: "created_at", label: "Created" },
      ]}
    />
  );
}