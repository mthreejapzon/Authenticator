import { FlatList } from 'react-native';
import AccountListItem from './AccountListItem';

export default function AccountList({
  accounts,
  onDelete,
}: {
  accounts: { key: string; data: { name: string; value: string } | null }[];
  onDelete: (key: string) => void;
}) {
  return (
    <FlatList
      data={accounts}
      renderItem={({ item }) => (
        <AccountListItem account={item} onDelete={onDelete} />
      )}
      keyExtractor={(item) => item.key}
    />
  );
}
