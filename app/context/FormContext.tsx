import React, { createContext, useContext, useState } from "react";

export type FormFields = {
  accountName: string;
  username: string;
  password: string;
  websiteUrl: string;
  secretKey: string;
  notes: string;
};

type FormContextType = FormFields & {
  setFormData: (data: Partial<FormFields>) => void;
  resetForm: () => void;
};

const FormContext = createContext<FormContextType | undefined>(undefined);

export const FormProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [formData, setFormDataState] = useState<FormFields>({
    accountName: "",
    username: "",
    password: "",
    websiteUrl: "",
    secretKey: "",
    notes: "",
  });

  const setFormData = (data: Partial<FormFields>) =>
    setFormDataState((prev) => ({ ...prev, ...data }));

  const resetForm = () =>
    setFormDataState({
      accountName: "",
      username: "",
      password: "",
      websiteUrl: "",
      secretKey: "",
      notes: "",
    });

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
