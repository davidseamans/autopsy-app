import CrmTablePage from "./CrmTablePage";

export default function Pipeline() {
  return (
    <CrmTablePage
      title="Pipeline"
      table="pipeline"
      newLabel="+ New Pipeline"
      columns={[
        { key: "client", label: "Client" },
        { key: "job_location", label: "Job Location" },
        { key: "stage", label: "Stage" },
        { key: "value", label: "Value" },
        { key: "created_at", label: "Created" },
      ]}
    />
  );
}