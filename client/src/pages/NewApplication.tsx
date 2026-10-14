import { useNavigate } from "react-router";
import { api, type Application } from "../api";
import ApplicationForm, { emptyApplication, toPayload } from "../components/ApplicationForm";

export default function NewApplication() {
  const navigate = useNavigate();

  return (
    <>
      <header className="page-header">
        <h1>New application</h1>
      </header>
      <div className="card">
        <ApplicationForm
          initial={emptyApplication()}
          submitLabel="Save application"
          onCancel={() => navigate(-1)}
          onSubmit={async (values) => {
            const res = await api.post<{ data: Application }>("/applications", {
              ...toPayload(values),
              company_name: values.company_name,
            });
            navigate(`/applications/${res.data.id}`);
          }}
        />
      </div>
    </>
  );
}
