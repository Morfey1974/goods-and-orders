if (args.Length == 0)
{
    Console.Error.WriteLine("usage: HashPassword <password>");
    return 1;
}
Console.WriteLine(BCrypt.Net.BCrypt.HashPassword(args[0]));
return 0;
