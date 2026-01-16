import { SectionList, Text, View } from 'react-native';
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
      value: string;
      isFavorite?: boolean;
    } | null 
  }[];
  onDelete: (key: string) => void;
  onEdit: (key: string, newName: string) => void;
}) {
  // Separate favorites from non-favorites
  const favoriteAccounts = accounts.filter(acc => acc.data?.isFavorite);
  const regularAccounts = accounts.filter(acc => !acc.data?.isFavorite);

  // Create sections
  const sections = [];
  
  if (favoriteAccounts.length > 0) {
    sections.push({
      title: 'Favorites',
      data: favoriteAccounts,
    });
  }
  
  if (regularAccounts.length > 0) {
    sections.push({
      title: favoriteAccounts.length > 0 ? 'All Accounts' : '',
      data: regularAccounts,
    });
  }

  return (
    <SectionList
      sections={sections}
      renderItem={({ item }) => (
        <AccountListItem
          account={item}
          onDelete={onDelete}
        />
      )}
      renderSectionHeader={({ section: { title } }) => 
        title ? (
          <View style={{ 
            paddingHorizontal: 4,
            paddingVertical: 8,
            marginTop: 8,
          }}>
            <Text style={{ 
              fontSize: 14,
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {title}
            </Text>
          </View>
        ) : null
      }
      keyExtractor={(item) => item.key}
      stickySectionHeadersEnabled={false}
    />
  );
}
