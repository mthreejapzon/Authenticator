import React, { createContext, useContext, useState } from "react";

type FormContextType = {
  accountName: string;
  username: string;
  password: string;
  secretKey: string;
  setFormData: (data: Partial<FormContextType>) => void;
  resetForm: () => void;
};

const FormContext = createContext<FormContextType | undefined>(undefined);

export const FormProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [formData, setFormDataState] = useState({
    accountName: "",
    username: "",
    password: "",
    secretKey: "",
  });

  const setFormData = (data: Partial<FormContextType>) =>
    setFormDataState((prev) => ({ ...prev, ...data }));

  const resetForm = () =>
    setFormDataState({ accountName: "", username: "", password: "", secretKey: "" });

  return (
    <FormContext.Provider value={{ ...formData, setFormData, resetForm }}>
      {children}
    </FormContext.Provider>
  );
};

export const useForm = () => {
  const context = useContext(FormContext);
  if (!context) throw new Error("useForm must be used within a FormProvider");
  return context;
};
