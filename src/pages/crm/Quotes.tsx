import CrmTablePage from "./CrmTablePage";

export default function Quotes() {
  return (
    <CrmTablePage
      title="Quotes"
      table="quotes"
      newLabel="+ New Quote"
      columns={[
        { key: "client", label: "Client" },
        { key: "job_location", label: "Job Location" },
        { key: "amount", label: "Amount" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
    />
  );
}