import { FlatList } from 'react-native';
import AccountListItem from './AccountListItem';

export default function AccountList({
  accounts,
  onDelete,
  onEdit,
}: {
  accounts: { 
    key: string; 
    data: { 
      accountName: string; 
      username: string; 
      password: string; 
      value: string 
    } | null 
  }[];
  onDelete: (key: string) => void;
  onEdit: (key: string, newName: string) => void;
}) {
  return (
    <FlatList
      data={accounts}
      renderItem={({ item }) => (
        <AccountListItem
          account={item}
          onDelete={onDelete}
        />
      )}
      keyExtractor={(item) => item.key}
    />
  );
}
