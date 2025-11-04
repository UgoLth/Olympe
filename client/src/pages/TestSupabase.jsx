import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"

export default function TestSupabase() {
    const [data, setData] = useState([])
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchData = async () => {
            const { data, error } = await supabase.from("accounts").select("*")
            if (error) setError(error.message)
            else setData(data)
        }
        fetchData()
    }, [])

    return (
        <div style={{ padding: 20}}>
            <h1>Connexion Supabase</h1>
            {error && <p style={{ color: "red "}}>{error}</p>}
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    )
}