import AccountForm from "./components/AccountForm";
import { useForm } from "./context/FormContext";
export default function SetupScreen() {
  const {
    accountName,
    username,
    password,
    secretKey,
    notes,
    setFormData,
    resetForm,
  } = useForm();

  return (
    <AccountForm 
      accountName={accountName} 
      username={username} 
      password={password} 
      secretKey={secretKey} 
      notes={notes} 
      setFormData={setFormData} 
      resetForm={resetForm} 
    />
  );  
}
