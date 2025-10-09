import { FlatList } from 'react-native';
import AccountListItem from './AccountListItem';

export default function AccountList({
  accounts,
  onDelete,
  onEdit,
}: {
  accounts: { key: string; data: { name: string; value: string } | null }[];
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
          onEdit={onEdit}
        />
      )}
      keyExtractor={(item) => item.key}
    />
  );
}
