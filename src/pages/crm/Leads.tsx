import CrmTablePage from "./CrmTablePage";

export default function Leads() {
  return (
    <CrmTablePage
      title="Leads"
      table="leads"
      newLabel="+ New Lead"
      columns={[
        { key: "name", label: "Name" },
        { key: "job_location", label: "Job Location" },
        { key: "source", label: "Source" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
    />
  );
}