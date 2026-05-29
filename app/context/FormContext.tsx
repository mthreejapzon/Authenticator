import React, { createContext, useContext, useState } from "react";

export type CustomField = {
  label: string;
  value: string;
};

export type FormFields = {
  accountName: string;
  username: string;
  password: string;
  websiteUrl: string;
  secretKey: string;
  notes: string;
  customFields: CustomField[];
  tags: string[];
};

type FormContextType = FormFields & {
  setFormData: (data: Partial<FormFields>) => void;
  resetForm: () => void;
};

const FormContext = createContext<FormContextType | undefined>(undefined);

const initialState: FormFields = {
  accountName: "",
  username: "",
  password: "",
  websiteUrl: "",
  secretKey: "",
  notes: "",
  customFields: [],
  tags: [],
};

export const FormProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [formData, setFormDataState] = useState<FormFields>(initialState);

  const setFormData = (data: Partial<FormFields>) =>
    setFormDataState((prev) => ({ ...prev, ...data }));

  const resetForm = () => setFormDataState(initialState);

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
