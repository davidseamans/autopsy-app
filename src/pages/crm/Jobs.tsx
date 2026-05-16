import CrmTablePage from "./CrmTablePage";

export default function Jobs() {
  return (
    <CrmTablePage
      title="Jobs"
      table="jobs"
      newLabel="+ New Job"
      columns={[
        { key: "client", label: "Client" },
        { key: "job_location", label: "Job Location" },
        { key: "po_number", label: "PO Number" },
        { key: "cost_type", label: "Cost Type" },
        { key: "scheduled_at", label: "Scheduled" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
    />
  );
}