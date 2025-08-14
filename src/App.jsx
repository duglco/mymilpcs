
import { useEffect, useState } from "react";
import Map from "./components/Map";
import BaseTable from "./components/BaseTable";

export default function App() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const basePath = import.meta.env.BASE_URL || "/";
    fetch(`${basePath}bases.json`).then(r => r.json()).then(setData).catch(console.error);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold">Military Bases & Nearby Amenities</h1>
      <p className="text-sm opacity-70">Public, non-sensitive info only.</p>
      <Map data={data} />
      <BaseTable data={data} />
    </div>
  );
}
