#include <iostream>
#include <cctype>
using namespace std;
int main() {
  char signal[8] = "A2b";
  int count = 0;
  int i = 0;
  while (signal[i] != '\0') {
    if (isalpha(signal[i])) count++;
    i++;
  }
  cout << count << '\n';
}
